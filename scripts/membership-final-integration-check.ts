import { existsSync, readFileSync } from "node:fs";

process.env.IGO_DEMO_MODE = "false";

const NEW_REF = "ieutdqnlfiiaawctapor";
const OLD_REF = "urqizygucheilflanlea";
const PROD_REF = "luivrsuotrdkgxkhxxbq";

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "IGO_DEMO_MODE") continue;
    process.env[key] = value;
  }
}

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes(NEW_REF) || databaseUrl.includes(OLD_REF) || databaseUrl.includes(PROD_REF)) {
  console.error("Refusing script: DATABASE_URL is not the TEST project");
  process.exit(1);
}

const { prisma } = await import("../lib/db/prisma");
const { completePrismaSale, getPrismaPosSnapshot } = await import("../features/pos/prisma-repository");
const { openCashSession, getOpenCashSession } = await import("../features/cash-sessions/prisma-repository");
const { logPrismaReceiptReprint, voidPrismaSale } = await import("../features/pos/post-sale-repository");
const { exchangePrismaSale, returnPrismaSale } = await import("../features/pos/return-repository");
const { createPrismaHeldBill, listPrismaHeldBills, resumePrismaHeldBill } = await import("../features/pos/held-bills-repository");
const { createPrismaCustomer, getPrismaCustomerById, getPrismaCustomersSnapshot } = await import("../features/customers/prisma-repository");
const { canPerformStoreAction, STORE_ACTIONS } = await import("../features/permissions/store-permissions");
const { WRITE_PERMISSIONS, assertPermission } = await import("../lib/auth/permissions");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const PREFIX = "mem-qa";
const TENDER = 10_000_000;
const EPS = 1;

type Tenant = { branchId: string; companyId: string; userId: string; warehouseId: string };
type ProductFixture = { id: string; price: number; unitId: string };
type CheckRow = { detail: string; missing?: boolean; name: string; ok: boolean; section: string };

const results: CheckRow[] = [];

function check(section: string, name: string, ok: boolean, detail = "", missing = false) {
  results.push({ detail, missing, name, ok, section });
  console.log(`${missing ? "MISSING" : ok ? "PASS" : "FAIL"}  [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function near(a: number, b: number, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function expectThrow(section: string, name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(section, name, false, "expected an error but none was thrown");
  } catch (error) {
    check(section, name, true, error instanceof Error ? error.message : String(error));
  }
}

async function ledgerSum(customerId: string) {
  const rows = await prisma.loyaltyPointLedger.findMany({ where: { companyId: COMPANY_ID, customerId } });
  return rows.reduce((total, row) => total + row.points, 0);
}

function heldCartItem(product: ProductFixture, name: string, quantity: number) {
  return {
    barcode: `${product.id}-bc`,
    categoryName: "QA",
    conversionQty: 1,
    id: product.id,
    imageKey: "",
    nameEn: name,
    nameLo: name,
    priceLak: product.price,
    quantity,
    retailPriceLak: product.price,
    sku: `${product.id}-sku`,
    stockQty: 1_000_000,
    unitId: product.unitId,
    unitName: "Piece",
  };
}

async function upsertProduct(id: string, name: string, price: number): Promise<ProductFixture> {
  await prisma.product.upsert({
    create: {
      barcode: `${id}-bc`,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      costPriceLak: Math.round(price * 0.4),
      id,
      isActive: true,
      nameEn: name,
      nameLo: name,
      productCode: `${id}-code`,
      sellingPriceLak: price,
      sku: `${id}-sku`,
      status: "active",
    },
    update: { costPriceLak: Math.round(price * 0.4), isActive: true, sellingPriceLak: price, status: "active" },
    where: { id },
  });
  await prisma.productUnit.upsert({
    create: {
      conversionQty: 1,
      costPriceLak: Math.round(price * 0.4),
      id: `${id}-piece`,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      productId: id,
      sellingPriceLak: price,
      status: "active",
      unitName: "Piece",
    },
    update: { isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: price, status: "active" },
    where: { id: `${id}-piece` },
  });
  await prisma.inventoryBalance.upsert({
    create: { companyId: COMPANY_ID, productId: id, quantity: 1_000_000, warehouseId: WAREHOUSE_ID },
    update: { quantity: 1_000_000 },
    where: { warehouseId_productId: { productId: id, warehouseId: WAREHOUSE_ID } },
  });
  return { id, price, unitId: `${id}-piece` };
}

async function ensureOpenSession(tenant: Tenant) {
  await prisma.cashSession.updateMany({
    data: { cashDifference: 0, closedAt: new Date(), closingCash: 0, expectedCash: 0 },
    where: { cashierId: tenant.userId, closedAt: null, companyId: tenant.companyId },
  });
  if (!(await getOpenCashSession(tenant))) {
    await openCashSession({ openingCashLak: 500_000 }, tenant);
  }
}

function nextSaleNo(label: string) {
  return `MEMQA-${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function sell(
  tenant: Tenant,
  product: ProductFixture,
  quantity: number,
  options: { customerId?: string; redeemPoints?: number; saleLabel?: string } = {},
) {
  return completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: TENDER,
      changeAmount: 0,
      customerId: options.customerId,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId: product.id, quantity, sellingPrice: product.price, unitId: product.unitId }],
      paymentMode: "cash",
      qrAmount: 0,
      redeemPoints: options.redeemPoints ?? 0,
      saleNo: nextSaleNo(options.saleLabel ?? "SALE"),
      taxAmount: 0,
      taxRate: 0,
      totalAmount: TENDER,
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  );
}

async function pinLevel(customerId: string, levelId: string) {
  await prisma.customer.update({ data: { membershipLevelId: levelId }, where: { id: customerId } });
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !cashierUser) {
  console.error("Missing seed users.");
  process.exit(1);
}

const ownerTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant: Tenant = { branchId: BRANCH_ID, companyId: "not-gobox-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };

const sourceTables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
  `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('customers', 'membership_levels', 'loyalty_point_ledger', 'customer_subscriptions')`,
);
check(
  "0. Source of truth",
  "Prisma customers + membership_levels + loyalty_point_ledger",
  ["customers", "membership_levels", "loyalty_point_ledger"].every((name) => sourceTables.some((row) => row.table_name === name)),
  sourceTables.map((row) => row.table_name).join(","),
);

await prisma.membershipLevel.upsert({
  create: { companyId: COMPANY_ID, discountPercent: 10, id: `${PREFIX}-level`, isActive: true, minSpendLak: 0, name: "Mem QA Level" },
  update: { discountPercent: 10, isActive: true, minSpendLak: 0 },
  where: { id: `${PREFIX}-level` },
});
await prisma.membershipLevel.upsert({
  create: { companyId: COMPANY_ID, discountPercent: 0, id: `${PREFIX}-flat`, isActive: true, minSpendLak: 0, name: "Mem QA Flat" },
  update: { discountPercent: 0, isActive: true },
  where: { id: `${PREFIX}-flat` },
});

const core = await upsertProduct(`${PREFIX}-core`, "Mem QA Core 100k", 100_000);
const cheap = await upsertProduct(`${PREFIX}-cheap`, "Mem QA Cheap 1k", 1_000);
const hold = await upsertProduct(`${PREFIX}-hold`, "Mem QA Hold 40k", 40_000);
const ref = await upsertProduct(`${PREFIX}-ref`, "Mem QA Refund 90k", 90_000);
const orig = await upsertProduct(`${PREFIX}-orig`, "Mem QA Orig 100k", 100_000);
const repl = await upsertProduct(`${PREFIX}-repl`, "Mem QA Repl 120k", 120_000);
const voidp = await upsertProduct(`${PREFIX}-void`, "Mem QA Void 30k", 30_000);
const promo = await upsertProduct(`${PREFIX}-promo`, "Mem QA Promo 50k", 50_000);

await prisma.promotion.updateMany({
  data: { isActive: false, status: "inactive" },
  where: { id: { startsWith: PREFIX } },
});
await prisma.promotion.deleteMany({ where: { id: `${PREFIX}-member-only` } }).catch(() => undefined);
await prisma.promotion.create({
  data: {
    companyId: COMPANY_ID,
    discountPercent: 10,
    endDate: new Date("2099-12-31"),
    id: `${PREFIX}-member-only`,
    isActive: true,
    membershipLevels: { create: [{ membershipLevelId: `${PREFIX}-level` }] },
    products: { create: [{ productId: promo.id }] },
    promotionName: "Mem QA member-only",
    promotionType: "member_discount",
    startDate: new Date("2020-01-01"),
    status: "active",
  },
});

await ensureOpenSession(ownerTenant);
await ensureOpenSession(cashierTenant);

const created = await createPrismaCustomer(
  {
    fullName: "Mem QA Created",
    membershipLevelId: `${PREFIX}-level`,
    phone: "020-5550111",
  },
  ownerTenant,
);
const createdRow = await prisma.customer.findUniqueOrThrow({ where: { id: created.id } });
check("1. Create", "Member persists with name/phone/level", createdRow.fullName === "Mem QA Created" && createdRow.phone === "020-5550111" && createdRow.membershipLevelId === `${PREFIX}-level`);
check("2. Auto code", "Unique MEM- code generated and copied to QR", /^MEM-\d{6}$/.test(String(createdRow.customerCode)) && createdRow.qrMemberCode === createdRow.customerCode, `code=${createdRow.customerCode} qr=${createdRow.qrMemberCode}`);

const [concA, concB] = await Promise.all([
  createPrismaCustomer({ fullName: "Mem QA Conc A", membershipLevelId: `${PREFIX}-flat`, phone: "020-5551111" }, ownerTenant),
  createPrismaCustomer({ fullName: "Mem QA Conc B", membershipLevelId: `${PREFIX}-flat`, phone: "020-5551112" }, ownerTenant),
]);
check("2. Auto code", "Concurrent auto codes stay unique", concA.customerCode !== concB.customerCode && String(concA.customerCode).startsWith("MEM-") && String(concB.customerCode).startsWith("MEM-"), `${concA.customerCode} vs ${concB.customerCode}`);

await expectThrow("1. Create", "Duplicate customerCode rejected", () =>
  createPrismaCustomer(
    { customerCode: String(createdRow.customerCode), fullName: "Dup code", membershipLevelId: `${PREFIX}-flat`, phone: "020-5550999" },
    ownerTenant,
  ),
);

const samePhone = await createPrismaCustomer(
  { fullName: "Mem QA Same Phone", membershipLevelId: `${PREFIX}-flat`, phone: "020-5550111" },
  ownerTenant,
);
check("1. Create", "Duplicate phone follows current policy (allowed)", Boolean(samePhone.id) && samePhone.id !== created.id);

const audits = await prisma.auditLog.findMany({
  orderBy: { createdAt: "desc" },
  take: 30,
  where: { action: "create", companyId: COMPANY_ID, module: "customers" },
});
const createdAudit = audits.find((row) => JSON.stringify(row.newData ?? {}).includes("Mem QA Created"));
check("1. Create", "Audit record exists", Boolean(createdAudit), createdAudit ? String(createdAudit.action) : "none");

const snapshot = await getPrismaCustomersSnapshot(ownerTenant);
const refreshed = snapshot.customers.find((customer: { id: string }) => customer.id === created.id);
check("1. Create", "Refresh preserves member", Boolean(refreshed) && refreshed?.phone === "020-5550111" && refreshed?.customerCode === createdRow.customerCode);

const pos = await getPrismaPosSnapshot(ownerTenant);
const posMember = pos.customers.find((customer: { id: string }) => customer.id === created.id);
check("4. POS lookup", "POS snapshot includes Prisma member code/phone", Boolean(posMember) && posMember?.membershipNumber === createdRow.customerCode && posMember?.phone === "020-5550111");
check("3. Phone lookup", "Phone returns the created member", pos.customers.some((customer: { id: string; phone: string }) => customer.id === created.id && (customer.phone === "020-5550111" || customer.phone.replace(/\D/g, "") === "0205550111")));
check("4. QR/Barcode lookup", "Member code/QR matches the created member", pos.customers.some((customer: { id: string; membershipNumber: string; customerCode: string }) => customer.id === created.id && (customer.membershipNumber === createdRow.customerCode || customer.customerCode === createdRow.customerCode)));
const phoneMatches = pos.customers.filter((customer: { phone: string }) => customer.phone === "020-5550111" || customer.phone.replace(/\D/g, "") === "0205550111");
check("4. POS lookup", "Duplicate phone is ambiguous (does not silently collapse)", phoneMatches.length >= 2, `matches=${phoneMatches.length}`);

await prisma.customer.upsert({
  create: {
    branchId: BRANCH_ID,
    companyId: COMPANY_ID,
    customerCode: `${PREFIX}-expired`,
    fullName: "Mem QA Expired",
    id: `${PREFIX}-expired`,
    membershipLevelId: `${PREFIX}-level`,
    phone: "020-5550222",
    qrMemberCode: `${PREFIX}-expired`,
    status: "active",
  },
  update: { membershipLevelId: `${PREFIX}-level`, status: "active" },
  where: { id: `${PREFIX}-expired` },
});
await prisma.subscriptionPlan.upsert({
  create: { companyId: COMPANY_ID, id: `${PREFIX}-plan`, isActive: true, name: "Mem QA Plan", subscriptionType: "yearly" },
  update: { isActive: true },
  where: { id: `${PREFIX}-plan` },
});
await prisma.customerSubscription.deleteMany({ where: { customerId: `${PREFIX}-expired` } });
await prisma.customerSubscription.create({
  data: {
    customerId: `${PREFIX}-expired`,
    endDate: new Date("2020-01-02"),
    planId: `${PREFIX}-plan`,
    startDate: new Date("2019-01-01"),
    status: "active",
  },
});
const expiredPos = (await getPrismaPosSnapshot(ownerTenant)).customers.find((customer: { id: string }) => customer.id === `${PREFIX}-expired`);
check("6. Expiry", "Expired subscription is not Active", expiredPos?.membershipStatus === "Expired", `status=${expiredPos?.membershipStatus}`);

await prisma.customer.upsert({
  create: {
    branchId: BRANCH_ID,
    companyId: COMPANY_ID,
    customerCode: `${PREFIX}-inactive`,
    fullName: "Mem QA Inactive",
    id: `${PREFIX}-inactive`,
    membershipLevelId: `${PREFIX}-level`,
    phone: "020-5550333",
    status: "inactive",
  },
  update: { status: "inactive" },
  where: { id: `${PREFIX}-inactive` },
});
const inactivePos = (await getPrismaPosSnapshot(ownerTenant)).customers.find((customer: { id: string }) => customer.id === `${PREFIX}-inactive`);
check("6. Expiry", "Inactive member not selectable at POS", !inactivePos);

const guestSale = await sell(ownerTenant, core, 1, { saleLabel: "GUEST" });
const guestRow = await prisma.sale.findUniqueOrThrow({ include: { items: true }, where: { id: guestSale.id } });
check("8. Membership discount", "Guest pays retail", near(amount(guestRow.items[0]?.sellingPrice), 100_000));

await pinLevel(created.id, `${PREFIX}-level`);
const memberSale = await sell(ownerTenant, core, 1, { customerId: created.id, saleLabel: "DISC" });
const memberRow = await prisma.sale.findUniqueOrThrow({ include: { items: true, loyaltyPointLedger: true }, where: { id: memberSale.id } });
check("5. Level", "Active member 10% discount applied", near(amount(memberRow.items[0]?.sellingPrice), 90_000), `price=${memberRow.items[0]?.sellingPrice}`);
check("8. Membership discount", "Member attached to sale", String(memberRow.customerId) === created.id);

const expiredSale = await sell(ownerTenant, core, 1, { customerId: `${PREFIX}-expired`, saleLabel: "EXP" });
const expiredRow = await prisma.sale.findUniqueOrThrow({ include: { items: true }, where: { id: expiredSale.id } });
check("6. Expiry", "Expired member pays retail", near(amount(expiredRow.items[0]?.sellingPrice), 100_000), `price=${expiredRow.items[0]?.sellingPrice}`);

const earnRows = memberRow.loyaltyPointLedger.filter((row) => String(row.pointType) === "earn");
const expectedEarn = Math.floor(amount(memberRow.totalAmount) / 10_000);
check("7. Earn", "Points earned once from configured rule", earnRows.length === 1 && earnRows[0].points === expectedEarn, `earn=${earnRows[0]?.points} expected=${expectedEarn} total=${memberRow.totalAmount}`);
await logPrismaReceiptReprint(ownerTenant, memberSale.id);
const earnAfterReprint = await prisma.loyaltyPointLedger.count({ where: { customerId: created.id, pointType: "earn", saleId: memberSale.id } });
check("7. Earn", "Reprint does not duplicate earn", earnAfterReprint === 1);

const redeemMember = await createPrismaCustomer({ fullName: "Mem QA Redeem", membershipLevelId: `${PREFIX}-flat`, phone: "020-5551555" }, ownerTenant);
const earnForRedeem = await sell(ownerTenant, core, 1, { customerId: redeemMember.id, saleLabel: "EARNR" });
const redeemEarnPts = amount((await prisma.loyaltyPointLedger.findFirst({ where: { saleId: earnForRedeem.id, pointType: "earn" } }))?.points);
const redeemSale = await sell(ownerTenant, core, 1, { customerId: redeemMember.id, redeemPoints: Math.min(10, redeemEarnPts), saleLabel: "REDEEM" });
const redeemRow = await prisma.sale.findUniqueOrThrow({ include: { loyaltyPointLedger: true }, where: { id: redeemSale.id } });
const redeemLedger = redeemRow.loyaltyPointLedger.filter((row) => String(row.pointType) === "redeem");
check("9. Redeem", "Redeem decreases points once", redeemLedger.length === 1 && redeemLedger[0].points < 0);
await expectThrow("9. Redeem", "Over-redeem blocked", () => sell(ownerTenant, core, 1, { customerId: redeemMember.id, redeemPoints: 999_999, saleLabel: "OVER" }));

const promoMember = await createPrismaCustomer({ fullName: "Mem QA Promo", membershipLevelId: `${PREFIX}-level`, phone: "020-5551666" }, ownerTenant);
await pinLevel(promoMember.id, `${PREFIX}-level`);
const guestPromo = await sell(ownerTenant, promo, 1, { saleLabel: "PMOGUEST" });
const memberPromo = await sell(ownerTenant, promo, 1, { customerId: promoMember.id, saleLabel: "PMOMEM" });
const expiredPromo = await sell(ownerTenant, promo, 1, { customerId: `${PREFIX}-expired`, saleLabel: "PMOEXP" });
const guestPromoRow = await prisma.sale.findUniqueOrThrow({ include: { items: true }, where: { id: guestPromo.id } });
const memberPromoRow = await prisma.sale.findUniqueOrThrow({ include: { items: true }, where: { id: memberPromo.id } });
const expiredPromoRow = await prisma.sale.findUniqueOrThrow({ include: { items: true }, where: { id: expiredPromo.id } });
check("10. Member-only promo", "Guest does not get member-only promo", near(amount(guestPromoRow.items[0]?.promotionDiscount), 0), `disc=${guestPromoRow.items[0]?.promotionDiscount}`);
check("10. Member-only promo", "Eligible member gets promo", amount(memberPromoRow.items[0]?.promotionDiscount) > 0, `disc=${memberPromoRow.items[0]?.promotionDiscount} price=${memberPromoRow.items[0]?.sellingPrice}`);
check("10. Member-only promo", "Expired member does not get member-only promo", near(amount(expiredPromoRow.items[0]?.promotionDiscount), 0), `disc=${expiredPromoRow.items[0]?.promotionDiscount}`);

const holder = await createPrismaCustomer({ fullName: "Mem QA Hold", membershipLevelId: `${PREFIX}-flat`, phone: "020-5550444" }, ownerTenant);
const holdBeforeLedger = await prisma.loyaltyPointLedger.count({ where: { customerId: holder.id } });
const heldBefore = (await listPrismaHeldBills(ownerTenant)).length;
const held = await createPrismaHeldBill(
  {
    snapshot: {
      appliedPromotions: [],
      cardAmount: 0,
      cashAmount: hold.price,
      cartItems: [heldCartItem(hold, "Mem QA Hold", 1)],
      customer: {
        customerCode: holder.customerCode ?? "",
        id: holder.id,
        membershipNumber: holder.qrMemberCode ?? holder.customerCode ?? holder.id,
        membershipExpiry: "",
        membershipStatus: "Active",
        membershipType: "Yearly",
        name: "Mem QA Hold",
        phone: "020-5550444",
        pointsBalance: 0,
      },
      discountAmount: 0,
      discountPercent: 0,
      membershipDiscountLak: 0,
      paymentMode: "cash",
      qrAmount: 0,
      redeemPoints: 0,
      taxAmount: 0,
      taxEnabled: false,
      taxRatePercent: 0,
      transferAmount: 0,
    },
  },
  ownerTenant,
);
const heldRefresh = await listPrismaHeldBills(ownerTenant);
check("11. Hold/Resume", "Held member cart persists after refresh", heldRefresh.length === heldBefore + 1 && heldRefresh.some((bill: { id: string }) => bill.id === held.id));
check("11. Hold/Resume", "Hold does not earn points", (await prisma.loyaltyPointLedger.count({ where: { customerId: holder.id } })) === holdBeforeLedger);
const resumed = await resumePrismaHeldBill(held.id, ownerTenant);
check("11. Hold/Resume", "Resume restores member id", String(resumed.sale?.snapshot?.customer?.id ?? "") === holder.id);
check("11. Hold/Resume", "Resume does not earn points", (await prisma.loyaltyPointLedger.count({ where: { customerId: holder.id } })) === holdBeforeLedger);
const holdCheckout = await sell(ownerTenant, hold, 1, { customerId: holder.id, saleLabel: "HOLDCO" });
check("11. Hold/Resume", "Points earn only after checkout", (await prisma.loyaltyPointLedger.count({ where: { customerId: holder.id, pointType: "earn", saleId: holdCheckout.id } })) === 1);

const refMember = await createPrismaCustomer({ fullName: "Mem QA Refund", membershipLevelId: `${PREFIX}-flat`, phone: "020-5550555" }, ownerTenant);
const refSale = await sell(ownerTenant, ref, 2, { customerId: refMember.id, saleLabel: "REF" });
const refEarn = amount((await prisma.loyaltyPointLedger.findFirst({ where: { saleId: refSale.id, pointType: "earn" } }))?.points);
const refItem = await prisma.saleItem.findFirst({ where: { saleId: refSale.id } });
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(refItem?.id) }],
  reason: "Mem QA partial",
  refundMethod: "cash",
  saleId: refSale.id,
});
const afterPartial = await ledgerSum(refMember.id);
check("12. Refund", "Partial refund reverses proportional earn", afterPartial < refEarn && afterPartial >= 0, `originalEarn=${refEarn} afterPartial=${afterPartial}`);
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(refItem?.id) }],
  reason: "Mem QA full",
  refundMethod: "cash",
  saleId: refSale.id,
});
const afterFull = await ledgerSum(refMember.id);
check("12. Refund", "Full refund remaining earn reversed", afterFull <= 0, `afterFull=${afterFull}`);
await expectThrow("12. Refund", "Second refund cannot reverse again", () =>
  returnPrismaSale(ownerTenant, {
    items: [{ condition: "sellable", quantity: 1, saleItemId: String(refItem?.id) }],
    reason: "again",
    saleId: refSale.id,
  }),
);

const exMember = await createPrismaCustomer({ fullName: "Mem QA Exchange", membershipLevelId: `${PREFIX}-flat`, phone: "020-5550666" }, ownerTenant);
const exSale = await sell(ownerTenant, orig, 1, { customerId: exMember.id, saleLabel: "EX" });
const exItem = await prisma.saleItem.findFirst({ where: { saleId: exSale.id } });
const exchange = await exchangePrismaSale(ownerTenant, {
  paidAmountLak: 30_000,
  reason: "Mem QA exchange",
  refundMethod: "cash",
  replacementItems: [{ productId: repl.id, quantity: 1, unitId: repl.unitId }],
  returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: String(exItem?.id) }],
  saleId: exSale.id,
});
const pointsAfterEx = amount((await prisma.customer.findUnique({ where: { id: exMember.id } }))?.pointsBalance);
const exLedger = await ledgerSum(exMember.id);
check("13. Exchange", "Exchange completes with member difference", Boolean(exchange.refundId) && Number.isFinite(amount(exchange.differenceLak)), `diff=${exchange.differenceLak}`);
check("13. Exchange", "Points stay non-negative and match ledger", pointsAfterEx >= 0 && pointsAfterEx === exLedger, `balance=${pointsAfterEx} ledger=${exLedger}`);

const voidMember = await createPrismaCustomer({ fullName: "Mem QA Void", membershipLevelId: `${PREFIX}-flat`, phone: "020-5550777" }, ownerTenant);
const voidSale = await sell(ownerTenant, voidp, 1, { customerId: voidMember.id, saleLabel: "VOID" });
const pointsAfterVoidSale = amount((await prisma.customer.findUnique({ where: { id: voidMember.id } }))?.pointsBalance);
await voidPrismaSale(ownerTenant, { reason: "Mem QA void", saleId: voidSale.id });
const pointsAfterVoid = amount((await prisma.customer.findUnique({ where: { id: voidMember.id } }))?.pointsBalance);
const voidLedger = await ledgerSum(voidMember.id);
check("14. Void", "Earned points reverse after void", pointsAfterVoid < pointsAfterVoidSale || pointsAfterVoid === 0, `afterSale=${pointsAfterVoidSale} afterVoid=${pointsAfterVoid}`);
check("14. Void", "Balance matches ledger after void", pointsAfterVoid === voidLedger, `balance=${pointsAfterVoid} ledger=${voidLedger}`);
await expectThrow("14. Void", "Second void blocked", () => voidPrismaSale(ownerTenant, { saleId: voidSale.id }));

const reconBalance = amount((await prisma.customer.findUnique({ where: { id: redeemMember.id } }))?.pointsBalance);
const reconLedger = await ledgerSum(redeemMember.id);
check("15. Ledger", "Cached pointsBalance matches ledger sum", reconBalance === reconLedger, `balance=${reconBalance} ledger=${reconLedger}`);

const loyaltySettings = await prisma.companySetting.findUnique({ where: { companyId: COMPANY_ID } });
const minRedeem = Math.max(Math.floor(amount(loyaltySettings?.loyaltyMinRedeemPoints) || 1), 1);
const pointValue = Math.max(amount(loyaltySettings?.loyaltyPointValueLak) || 1, 1);
const raceRedeem = Math.max(minRedeem, 8);
const raceProduct = await upsertProduct(`${PREFIX}-race`, "Mem QA Race 20k", Math.max(raceRedeem * pointValue + 1_000, 20_000));
const raceA = await createPrismaCustomer({ fullName: "Mem QA Race A", membershipLevelId: `${PREFIX}-flat`, phone: "020-5550888" }, ownerTenant);
await prisma.customer.update({ data: { pointsBalance: raceRedeem }, where: { id: raceA.id } });
const raceResults = await Promise.allSettled([
  sell(ownerTenant, raceProduct, 1, { customerId: raceA.id, redeemPoints: raceRedeem, saleLabel: "RACE1" }),
  sell(ownerTenant, raceProduct, 1, { customerId: raceA.id, redeemPoints: raceRedeem, saleLabel: "RACE2" }),
]);
const raceWins = raceResults.filter((result) => result.status === "fulfilled").length;
const raceBalance = amount((await prisma.customer.findUnique({ where: { id: raceA.id } }))?.pointsBalance);
const raceFail = raceResults.filter((result) => result.status === "rejected").map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason)).join(" | ");
check("16. Concurrency", "Double redeem does not go negative", raceWins === 1 && raceBalance >= 0, `wins=${raceWins} balance=${raceBalance} min=${minRedeem} fail=${raceFail}`);

const mapped = await getPrismaCustomerById(redeemMember.id, ownerTenant);
check("17. Reports", "Member history has purchases and earn/redeem fields", Boolean(mapped) && (mapped?.earnedPoints ?? 0) >= 0 && (mapped?.redeemedPoints ?? 0) >= 0);

let foreignSawGobox = false;
let foreignReadDetail = "blocked";
try {
  const foreign = await getPrismaCustomersSnapshot(foreignTenant);
  foreignSawGobox = foreign.customers.some((customer: { id: string }) => customer.id === created.id);
  foreignReadDetail = `count=${foreign.customers.length}`;
} catch (error) {
  foreignReadDetail = error instanceof Error ? error.message : String(error);
}
check("18. Permission", "Cross-company member read blocked", !foreignSawGobox, foreignReadDetail);
await expectThrow("18. Permission", "Cross-company create blocked", () =>
  createPrismaCustomer({ fullName: "Foreign", phone: "020-5550000" }, foreignTenant),
);

const cashierPos = await getPrismaPosSnapshot(cashierTenant);
check("18. Permission", "Cashier can lookup/select at POS", cashierPos.customers.some((customer: { id: string }) => customer.id === created.id));
await expectThrow("18. Permission", "Cashier cannot manage membership levels", () => assertPermission(cashierTenant, WRITE_PERMISSIONS.membershipLevelsManage));
let cashierCreateDenied = false;
let cashierCreateDetail = "permitted by existing role";
try {
  await createPrismaCustomer({ fullName: "Cashier create", phone: "020-5550001" }, cashierTenant);
} catch (error) {
  cashierCreateDenied = true;
  cashierCreateDetail = error instanceof Error ? error.message : String(error);
}
check(
  "18. Permission",
  "Cashier member administration follows current matrix",
  cashierCreateDenied || canPerformStoreAction({ role: "cashier" }, STORE_ACTIONS.CUSTOMER_CREATE),
  cashierCreateDetail,
);

check("19. Import/Export", "Customer Import/Export buttons", false, "Placeholder modal only; no CSV/Excel backend", true);

await prisma.customer.updateMany({
  data: { status: "inactive" },
  where: { OR: [{ id: { startsWith: PREFIX } }, { fullName: { startsWith: "Mem QA" } }], companyId: COMPANY_ID },
});
await prisma.promotion.updateMany({ data: { isActive: false, status: "inactive" }, where: { id: { startsWith: PREFIX } } });

const missing = results.filter((row) => row.missing);
const failed = results.filter((row) => !row.ok && !row.missing);
const passed = results.filter((row) => row.ok).length;
console.log(`\nMembership final integration: ${passed}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}${missing.length ? ` (${missing.length} MISSING)` : ""}`);
for (const row of missing) console.log(`MISSING REQUIRED LINK  ${row.name} — ${row.detail}`);
for (const row of failed) console.log(`FAIL  [${row.section}] ${row.name} — ${row.detail}`);
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
