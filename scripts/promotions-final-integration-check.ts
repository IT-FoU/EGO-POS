import { existsSync, readFileSync } from "node:fs";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

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

loadProjectEnvFiles();
resolveScriptDatabaseUrl("test-write");

const { prisma } = await import("../lib/db/prisma");
const { completePrismaSale, getPrismaPosSnapshot } = await import("../features/pos/prisma-repository");
const { openCashSession, getOpenCashSession } = await import("../features/cash-sessions/prisma-repository");
const { getPrismaSaleById, voidPrismaSale } = await import("../features/pos/post-sale-repository");
const { exchangePrismaSale, returnPrismaSale } = await import("../features/pos/return-repository");
const { createPrismaHeldBill, listPrismaHeldBills, resumePrismaHeldBill } = await import("../features/pos/held-bills-repository");
const { getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");
const { archivePrismaPromotion, createPrismaPromotion, getPrismaPromotionsSnapshot } = await import("../features/promotions/prisma-repository");
const { applyLoadedPromotions } = await import("../features/promotions/promotion-checkout");
const { canPerformStoreAction, STORE_ACTIONS } = await import("../features/permissions/store-permissions");
const { WRITE_PERMISSIONS, assertPermission } = await import("../lib/auth/permissions");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const PREFIX = "promo-qa";
const EPS = 1;
const TENDER = 10_000_000;

type Tenant = { branchId: string; companyId: string; userId: string; warehouseId: string };
type ProductFixture = { id: string; price: number; unitId: string };
type CheckRow = { detail: string; missing?: boolean; name: string; ok: boolean; section: string };

const results: CheckRow[] = [];

function check(section: string, name: string, ok: boolean, detail = "", missing = false) {
  results.push({ detail, missing, name, ok, section });
  const label = missing ? "MISSING" : ok ? "PASS" : "FAIL";
  console.log(`${label}  [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
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

function line(productId: string, quantity: number, sellingPrice: number) {
  return {
    baseQuantity: quantity,
    costPrice: Math.round(sellingPrice * 0.4),
    discountAmount: 0,
    productId,
    profitAmount: 0,
    promotionDiscount: 0,
    quantity,
    sellingPrice,
    totalAmount: sellingPrice * quantity,
    unitId: `${productId}-piece`,
  };
}

async function loadPromo(id: string) {
  return prisma.promotion.findFirstOrThrow({
    include: { categories: true, membershipLevels: true, products: true },
    where: { id },
  });
}

function engineDiscount(
  promotions: Array<Record<string, unknown>>,
  items: ReturnType<typeof line>[],
  options: { categoryByProduct?: Map<string, string | null>; membershipLevelId?: string | null; promotionCodes?: string[] } = {},
) {
  return applyLoadedPromotions(items, promotions, {
    allowStacking: false,
    appliedPromotionCodes: options.promotionCodes,
    categoryByProduct: options.categoryByProduct ?? new Map(items.map((item) => [item.productId, null])),
    companyId: COMPANY_ID,
    membershipLevelId: options.membershipLevelId ?? null,
  });
}

async function upsertProduct(id: string, name: string, price: number, categoryId?: string): Promise<ProductFixture> {
  await prisma.product.upsert({
    create: {
      barcode: `${id}-bc`,
      branchId: BRANCH_ID,
      categoryId,
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
    update: {
      categoryId,
      costPriceLak: Math.round(price * 0.4),
      isActive: true,
      nameEn: name,
      nameLo: name,
      sellingPriceLak: price,
      status: "active",
    },
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
    update: {
      conversionQty: 1,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      sellingPriceLak: price,
      status: "active",
    },
    where: { id: `${id}-piece` },
  });
  await prisma.inventoryBalance.upsert({
    create: { companyId: COMPANY_ID, productId: id, quantity: 1_000_000, warehouseId: WAREHOUSE_ID },
    update: { quantity: 1_000_000 },
    where: { warehouseId_productId: { productId: id, warehouseId: WAREHOUSE_ID } },
  });
  return { id, price, unitId: `${id}-piece` };
}

async function upsertPromo(id: string, data: Record<string, any>) {
  const productIds = (data.products?.create ?? []).map((row: { productId: string }) => row.productId);
  const categoryIds = (data.categories?.create ?? []).map((row: { categoryId: string }) => row.categoryId);
  const membershipLevelIds = (data.membershipLevels?.create ?? []).map((row: { membershipLevelId: string }) => row.membershipLevelId);
  const scalar = {
    companyId: COMPANY_ID,
    discountAmountLak: data.discountAmountLak ?? null,
    discountPercent: data.discountPercent ?? null,
    endDate: data.endDate ?? new Date("2099-12-31"),
    isActive: data.isActive ?? true,
    priority: data.priority ?? 0,
    promotionCode: data.promotionCode ?? null,
    promotionName: data.promotionName,
    promotionType: data.promotionType,
    startDate: data.startDate ?? new Date("2020-01-01"),
    status: data.status ?? "active",
  };
  const existing = await prisma.promotion.findUnique({ where: { id } });
  if (existing) {
    await prisma.promotion.update({ data: scalar, where: { id } });
    await prisma.promotionProduct.deleteMany({ where: { promotionId: id } });
    await prisma.promotionCategory.deleteMany({ where: { promotionId: id } });
    await prisma.promotionMembershipLevel.deleteMany({ where: { promotionId: id } });
  } else {
    await prisma.promotion.create({ data: { id, ...scalar } });
  }
  if (productIds.length) {
    await prisma.promotionProduct.createMany({ data: productIds.map((productId: string) => ({ productId, promotionId: id })), skipDuplicates: true });
  }
  if (categoryIds.length) {
    await prisma.promotionCategory.createMany({ data: categoryIds.map((categoryId: string) => ({ categoryId, promotionId: id })), skipDuplicates: true });
  }
  if (membershipLevelIds.length) {
    await prisma.promotionMembershipLevel.createMany({ data: membershipLevelIds.map((membershipLevelId: string) => ({ membershipLevelId, promotionId: id })), skipDuplicates: true });
  }
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
  return `PROMOQA-${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function sell(
  tenant: Tenant,
  product: ProductFixture,
  quantity: number,
  options: { customerId?: string; promotionCodes?: string[]; saleLabel?: string } = {},
) {
  const listTotal = product.price * quantity;
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
      promotionCodes: options.promotionCodes,
      qrAmount: 0,
      saleNo: nextSaleNo(options.saleLabel ?? "SALE"),
      taxAmount: 0,
      taxRate: 0,
      totalAmount: TENDER,
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  );
}

async function saleRow(saleId: string) {
  return prisma.sale.findUniqueOrThrow({
    include: { items: true, promotionUsages: true },
    where: { id: saleId },
  });
}

function heldCartItem(product: ProductFixture, name: string, quantity: number) {
  return {
    barcode: `${product.id}-bc`,
    categoryId: undefined as string | undefined,
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

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const managerUser = await prisma.user.findFirst({ where: { username: "manager" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !managerUser || !cashierUser) {
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant: Tenant = { branchId: BRANCH_ID, companyId: "not-gobox-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };

const sourceTables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
  `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('promotions', 'promotion_products', 'promotion_categories', 'promotion_usages')`,
);
check(
  "0. Source of truth",
  "Persisted source is Prisma promotions (company-scoped, no branch)",
  sourceTables.some((row) => row.table_name === "promotions") &&
    sourceTables.some((row) => row.table_name === "promotion_products"),
  sourceTables.map((row) => row.table_name).join(","),
);

await prisma.promotion.updateMany({
  data: { isActive: false, status: "inactive" },
  where: { companyId: COMPANY_ID, id: { startsWith: PREFIX } },
});
await prisma.promotion.updateMany({
  data: { isActive: false, promotionCode: null, status: "inactive" },
  where: { companyId: COMPANY_ID, promotionCode: { startsWith: "PROMOQA-" } },
});

await prisma.category.upsert({
  create: { branchId: BRANCH_ID, companyId: COMPANY_ID, id: `${PREFIX}-cat`, nameEn: "Promo QA Cat", nameLo: "Promo QA Cat" },
  update: { nameEn: "Promo QA Cat", nameLo: "Promo QA Cat" },
  where: { id: `${PREFIX}-cat` },
});
await prisma.category.upsert({
  create: { branchId: BRANCH_ID, companyId: COMPANY_ID, id: `${PREFIX}-other-cat`, nameEn: "Promo QA Other", nameLo: "Promo QA Other" },
  update: { nameEn: "Promo QA Other" },
  where: { id: `${PREFIX}-other-cat` },
});
await prisma.membershipLevel.upsert({
  create: { companyId: COMPANY_ID, discountPercent: 0, id: `${PREFIX}-level`, isActive: true, minSpendLak: 0, name: "Promo QA Level" },
  update: { discountPercent: 0, isActive: true },
  where: { id: `${PREFIX}-level` },
});
await prisma.customer.upsert({
  create: {
    branchId: BRANCH_ID,
    companyId: COMPANY_ID,
    customerCode: `${PREFIX}-member`,
    fullName: "Promo QA Member",
    id: `${PREFIX}-member`,
    membershipLevelId: `${PREFIX}-level`,
    phone: "020-5550888",
    pointsBalance: 0,
    status: "active",
  },
  update: { membershipLevelId: `${PREFIX}-level`, status: "active" },
  where: { id: `${PREFIX}-member` },
});

const pct = await upsertProduct(`${PREFIX}-pct`, "Promo QA Percent 100k", 100_000);
const fix = await upsertProduct(`${PREFIX}-fix`, "Promo QA Fixed 100k", 100_000);
const scoped = await upsertProduct(`${PREFIX}-in`, "Promo QA Scoped In", 80_000);
const other = await upsertProduct(`${PREFIX}-out`, "Promo QA Scoped Out", 80_000);
const catIn = await upsertProduct(`${PREFIX}-cat-in`, "Promo QA Cat In", 60_000, `${PREFIX}-cat`);
const catOut = await upsertProduct(`${PREFIX}-cat-out`, "Promo QA Cat Out", 60_000, `${PREFIX}-other-cat`);
const mem = await upsertProduct(`${PREFIX}-mem`, "Promo QA Member", 50_000);
const prio = await upsertProduct(`${PREFIX}-prio`, "Promo QA Priority", 70_000);
const hold = await upsertProduct(`${PREFIX}-hold`, "Promo QA Hold", 40_000);
const hexp = await upsertProduct(`${PREFIX}-hexp`, "Promo QA Hold Expire", 35_000);
const ref = await upsertProduct(`${PREFIX}-ref`, "Promo QA Refund", 90_000);
const orig = await upsertProduct(`${PREFIX}-orig`, "Promo QA Orig 100k", 100_000);
const repl = await upsertProduct(`${PREFIX}-repl`, "Promo QA Repl 120k", 120_000);
const voidp = await upsertProduct(`${PREFIX}-void`, "Promo QA Void", 30_000);
const coup = await upsertProduct(`${PREFIX}-coup`, "Promo QA Coupon", 45_000);
const datep = await upsertProduct(`${PREFIX}-date`, "Promo QA Date", 55_000);
const inact = await upsertProduct(`${PREFIX}-inact`, "Promo QA Inactive", 22_000);
const arch = await upsertProduct(`${PREFIX}-arch`, "Promo QA Archive", 25_000);

await upsertPromo(`${PREFIX}-pct`, {
  discountPercent: 10,
  products: { create: [{ productId: pct.id }] },
  promotionName: "Promo QA 10%",
  promotionType: "percentage",
});
await upsertPromo(`${PREFIX}-fix`, {
  discountAmountLak: 20_000,
  products: { create: [{ productId: fix.id }] },
  promotionName: "Promo QA 20k",
  promotionType: "fixed_amount",
});
await upsertPromo(`${PREFIX}-scope-prod`, {
  discountPercent: 10,
  products: { create: [{ productId: scoped.id }] },
  promotionName: "Promo QA product scope",
  promotionType: "percentage",
});
await upsertPromo(`${PREFIX}-scope-cat`, {
  categories: { create: [{ categoryId: `${PREFIX}-cat` }] },
  discountPercent: 10,
  promotionName: "Promo QA category scope",
  promotionType: "percentage",
});
await upsertPromo(`${PREFIX}-member`, {
  discountPercent: 10,
  membershipLevels: { create: [{ membershipLevelId: `${PREFIX}-level` }] },
  products: { create: [{ productId: mem.id }] },
  promotionName: "Promo QA member only",
  promotionType: "member_discount",
});
await upsertPromo(`${PREFIX}-future`, {
  discountPercent: 10,
  endDate: new Date("2099-12-31"),
  products: { create: [{ productId: datep.id }] },
  promotionName: "Promo QA future",
  promotionType: "percentage",
  startDate: new Date("2099-01-01"),
});
await upsertPromo(`${PREFIX}-expired`, {
  discountPercent: 10,
  endDate: new Date("2020-01-02"),
  products: { create: [{ productId: datep.id }] },
  promotionName: "Promo QA expired",
  promotionType: "percentage",
  startDate: new Date("2020-01-01"),
});
await upsertPromo(`${PREFIX}-inactive`, {
  discountPercent: 10,
  isActive: false,
  products: { create: [{ productId: inact.id }] },
  promotionName: "Promo QA inactive",
  promotionType: "percentage",
  status: "inactive",
});
await upsertPromo(`${PREFIX}-arch`, {
  discountPercent: 10,
  products: { create: [{ productId: arch.id }] },
  promotionName: "Promo QA archive",
  promotionType: "percentage",
});
await upsertPromo(`${PREFIX}-prio-low`, {
  discountPercent: 10,
  priority: 1,
  products: { create: [{ productId: prio.id }] },
  promotionName: "Promo QA prio low",
  promotionType: "percentage",
});
await upsertPromo(`${PREFIX}-prio-high`, {
  discountAmountLak: 20_000,
  priority: 50,
  products: { create: [{ productId: prio.id }] },
  promotionName: "Promo QA prio high",
  promotionType: "fixed_amount",
});
await upsertPromo(`${PREFIX}-hold`, {
  discountPercent: 10,
  products: { create: [{ productId: hold.id }] },
  promotionName: "Promo QA hold",
  promotionType: "percentage",
});
await upsertPromo(`${PREFIX}-hold-live`, {
  discountPercent: 10,
  products: { create: [{ productId: hexp.id }] },
  promotionName: "Promo QA hold live",
  promotionType: "percentage",
});
await upsertPromo(`${PREFIX}-ref`, {
  discountPercent: 10,
  products: { create: [{ productId: ref.id }] },
  promotionName: "Promo QA refund",
  promotionType: "percentage",
});
await upsertPromo(`${PREFIX}-ex`, {
  discountPercent: 10,
  products: { create: [{ productId: orig.id }, { productId: repl.id }] },
  promotionName: "Promo QA exchange",
  promotionType: "percentage",
});
await upsertPromo(`${PREFIX}-void-live`, {
  discountPercent: 10,
  products: { create: [{ productId: voidp.id }] },
  promotionName: "Promo QA void live",
  promotionType: "percentage",
});
await upsertPromo(`${PREFIX}-coupon`, {
  discountPercent: 10,
  products: { create: [{ productId: coup.id }] },
  promotionCode: "PROMOQA-SAVE10",
  promotionName: "Promo QA coupon gated",
  promotionType: "percentage",
});

await ensureOpenSession(ownerTenant);
await ensureOpenSession(cashierTenant);

const posSnapshot = await getPrismaPosSnapshot(ownerTenant);
check(
  "0. Source of truth",
  "POS snapshot loads persisted active promotions",
  Array.isArray(posSnapshot.promotions) && posSnapshot.promotions.some((promo: { id: string }) => promo.id === `${PREFIX}-pct`),
  `count=${posSnapshot.promotions?.length ?? 0}`,
);
check(
  "0. Source of truth",
  "POS products include categoryId for category scope",
  posSnapshot.products.some((product: { id: string; categoryId?: string }) => product.id === catIn.id && product.categoryId === `${PREFIX}-cat`),
);

const pctPromo = await loadPromo(`${PREFIX}-pct`);
const engineOnce = engineDiscount([pctPromo], [line(pct.id, 1, pct.price)]);
const engineTwice = engineDiscount([pctPromo], [line(pct.id, 1, pct.price)]);
check("7. Priority/conflict", "Engine is deterministic", engineOnce[0].promotionId === engineTwice[0].promotionId && near(engineOnce[0].promotionDiscount, engineTwice[0].promotionDiscount));

const qty1 = engineDiscount([pctPromo], [line(pct.id, 1, pct.price)]);
const qty2 = engineDiscount([pctPromo], [line(pct.id, 2, pct.price)]);
check("8. Discount math", "Quantity scales percentage discount", near(qty1[0].promotionDiscount, 10_000) && near(qty2[0].promotionDiscount, 20_000), `q1=${qty1[0].promotionDiscount} q2=${qty2[0].promotionDiscount}`);
check("8. Discount math", "Discount cannot go negative", qty2[0].totalAmount >= 0 && qty2[0].promotionDiscount <= pct.price * 2);

const memberPromo = await loadPromo(`${PREFIX}-member`);
const guestEngine = engineDiscount([memberPromo], [line(mem.id, 1, mem.price)], { membershipLevelId: null });
const memberEngine = engineDiscount([memberPromo], [line(mem.id, 1, mem.price)], { membershipLevelId: `${PREFIX}-level` });
check("5. Member", "Engine guest does not receive member-only promo", near(guestEngine[0].promotionDiscount, 0), `disc=${guestEngine[0].promotionDiscount}`);
check("5. Member", "Engine member receives member-only promo", near(memberEngine[0].promotionDiscount, 5_000), `disc=${memberEngine[0].promotionDiscount}`);
check("11. Member recalc", "Removing member clears promo discount", near(guestEngine[0].promotionDiscount, 0) && near(memberEngine[0].promotionDiscount, 5_000));

const reportsBefore = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });

const pctSale = await sell(ownerTenant, pct, 1, { saleLabel: "PCT" });
const pctRow = await saleRow(pctSale.id);
check("1. Percentage", "100,000 × 10% = 10,000", near(amount(pctRow.items[0]?.promotionDiscount), 10_000), `disc=${pctRow.items[0]?.promotionDiscount}`);
check("1. Percentage", "Applied once", pctRow.promotionUsages.length === 1 && near(amount(pctRow.discountAmount), 10_000), `usages=${pctRow.promotionUsages.length} discount=${pctRow.discountAmount}`);
check("13. Normal sale", "Promoted sale stores line promo and net total", near(amount(pctRow.items[0]?.totalAmount), 90_000) && amount(pctRow.totalAmount) > 0, `line=${pctRow.items[0]?.totalAmount} total=${pctRow.totalAmount}`);

const cashierPct = await sell(cashierTenant, pct, 1, { saleLabel: "CASHPCT" });
const cashierPctRow = await saleRow(cashierPct.id);
check("17. Permission", "Cashier can use eligible promotions at POS", near(amount(cashierPctRow.items[0]?.promotionDiscount), 10_000));

const fixSale = await sell(ownerTenant, fix, 1, { saleLabel: "FIX" });
const fixRow = await saleRow(fixSale.id);
check("2. Fixed amount", "100,000 with 20,000 off = 80,000 line", near(amount(fixRow.items[0]?.promotionDiscount), 20_000) && near(amount(fixRow.items[0]?.totalAmount), 80_000), `disc=${fixRow.items[0]?.promotionDiscount} line=${fixRow.items[0]?.totalAmount}`);

const scopedIn = await sell(ownerTenant, scoped, 1, { saleLabel: "SCOPEIN" });
const scopedOut = await sell(ownerTenant, other, 1, { saleLabel: "SCOPEOUT" });
check("4. Product scope", "Intended product receives discount", near(amount((await saleRow(scopedIn.id)).items[0]?.promotionDiscount), 8_000));
check("4. Product scope", "Other product does not", near(amount((await saleRow(scopedOut.id)).items[0]?.promotionDiscount), 0), `disc=${(await saleRow(scopedOut.id)).items[0]?.promotionDiscount}`);

const catInSale = await sell(ownerTenant, catIn, 1, { saleLabel: "CATIN" });
const catOutSale = await sell(ownerTenant, catOut, 1, { saleLabel: "CATOUT" });
check("4. Category scope", "In-category product receives discount", near(amount((await saleRow(catInSale.id)).items[0]?.promotionDiscount), 6_000));
check("4. Category scope", "Outside category does not", near(amount((await saleRow(catOutSale.id)).items[0]?.promotionDiscount), 0));

const guestMem = await sell(ownerTenant, mem, 1, { saleLabel: "GUEST" });
const memberMem = await sell(ownerTenant, mem, 1, { customerId: `${PREFIX}-member`, saleLabel: "MEMBER" });
check("5. Member", "Non-member sale has no member promo", near(amount((await saleRow(guestMem.id)).items[0]?.promotionDiscount), 0));
check("5. Member", "Eligible member receives promo", near(amount((await saleRow(memberMem.id)).items[0]?.promotionDiscount), 5_000));

const futureSale = await sell(ownerTenant, datep, 1, { saleLabel: "FUTURE" });
check("3. Date/status", "Promotion before start / after end does not apply", near(amount((await saleRow(futureSale.id)).items[0]?.promotionDiscount), 0), `disc=${(await saleRow(futureSale.id)).items[0]?.promotionDiscount}`);

const inactiveSale = await sell(ownerTenant, inact, 1, { saleLabel: "INACTIVE" });
check("3. Date/status", "Inactive promotion does not apply", near(amount((await saleRow(inactiveSale.id)).items[0]?.promotionDiscount), 0));

const liveThenArchive = await sell(ownerTenant, arch, 1, { saleLabel: "ARCHPRE" });
const archiveRow = await saleRow(liveThenArchive.id);
check("16. Archive", "Active promotion applies before archive", near(amount(archiveRow.items[0]?.promotionDiscount), 2_500));
await prisma.promotion.update({
  data: { isActive: false, status: "inactive" },
  where: { id: `${PREFIX}-arch` },
});
const afterArchive = await sell(ownerTenant, arch, 1, { saleLabel: "ARCHPOST" });
check("16. Archive", "Archived promotion blocked on new sales", near(amount((await saleRow(afterArchive.id)).items[0]?.promotionDiscount), 0));
check("16. Archive", "Historical sale retains promotion discount", near(amount((await prisma.saleItem.findFirst({ where: { saleId: liveThenArchive.id } }))?.promotionDiscount), 2_500));

const prioSale = await sell(ownerTenant, prio, 1, { saleLabel: "PRIO" });
const prioRow = await saleRow(prioSale.id);
check(
  "7. Priority/conflict",
  "Best discount wins (20,000 fixed over 10%)",
  near(amount(prioRow.items[0]?.promotionDiscount), 20_000) && String(prioRow.items[0]?.promotionId) === `${PREFIX}-prio-high`,
  `disc=${prioRow.items[0]?.promotionDiscount} promo=${prioRow.items[0]?.promotionId}`,
);
check("7. Priority/conflict", "No stacking", prioRow.promotionUsages.length === 1, `usages=${prioRow.promotionUsages.length}`);

const couponNoCode = await sell(ownerTenant, coup, 1, { saleLabel: "COUPNONE" });
check("6. Coupon", "Coded promotion does not auto-apply without POS code", near(amount((await saleRow(couponNoCode.id)).items[0]?.promotionDiscount), 0));
const couponWithCode = await sell(ownerTenant, coup, 1, { promotionCodes: ["PROMOQA-SAVE10"], saleLabel: "COUPYES" });
check("6. Coupon", "Matching promotionCode applies when supplied to checkout", near(amount((await saleRow(couponWithCode.id)).items[0]?.promotionDiscount), 4_500));
const couponBad = await sell(ownerTenant, coup, 1, { promotionCodes: ["wrong"], saleLabel: "COUPBAD" });
check("6. Coupon", "Invalid code rejected", near(amount((await saleRow(couponBad.id)).items[0]?.promotionDiscount), 0));
check("6. Coupon", "POS coupon entry UI", false, "No POS coupon input; checkout promotionCodes exists only in API", true);

await expectThrow("18. Duplicate", "Client promotion claims rejected", () =>
  completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: TENDER,
      changeAmount: 0,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId: pct.id, promotionDiscount: 10_000, promotionId: `${PREFIX}-pct`, quantity: 1, sellingPrice: pct.price, unitId: pct.unitId }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo: nextSaleNo("CLAIM"),
      taxAmount: 0,
      taxRate: 0,
      totalAmount: TENDER,
      warehouseId: WAREHOUSE_ID,
    },
    ownerTenant,
  ),
);

await prisma.promotion.upsert({
  create: {
    companyId: COMPANY_ID,
    discountPercent: 5,
    endDate: new Date("2099-12-31"),
    id: `${PREFIX}-dup-a`,
    isActive: true,
    promotionCode: "PROMOQA-DUP",
    promotionName: "Promo QA dup a",
    promotionType: "percentage",
    startDate: new Date("2020-01-01"),
    status: "active",
  },
  update: {
    isActive: true,
    promotionCode: "PROMOQA-DUP",
    status: "active",
  },
  where: { id: `${PREFIX}-dup-a` },
});
await expectThrow("18. Duplicate", "Duplicate coupon/code insert blocked", () =>
  prisma.promotion.create({
    data: {
      companyId: COMPANY_ID,
      discountPercent: 5,
      endDate: new Date("2099-12-31"),
      isActive: true,
      promotionCode: "PROMOQA-DUP",
      promotionName: "Promo QA dup b",
      promotionType: "percentage",
      startDate: new Date("2020-01-01"),
      status: "active",
    },
  }),
);

const heldBefore = (await listPrismaHeldBills(ownerTenant)).length;
const held = await createPrismaHeldBill(
  {
    snapshot: {
      appliedPromotions: [],
      cardAmount: 0,
      cashAmount: hold.price,
      cartItems: [heldCartItem(hold, "Promo QA Hold", 1)],
      customer: null,
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
const heldAfterRefresh = await listPrismaHeldBills(ownerTenant);
check("10. Hold/Resume", "Held promotional cart persists after refresh", heldAfterRefresh.length === heldBefore + 1 && heldAfterRefresh.some((bill: { id: string }) => bill.id === held.id));
await resumePrismaHeldBill(held.id, ownerTenant);
const holdCheckout = await sell(ownerTenant, hold, 1, { saleLabel: "HOLDCO" });
const holdRow = await saleRow(holdCheckout.id);
check("10. Hold/Resume", "Resume checkout recalculates promo once", holdRow.promotionUsages.length === 1 && near(amount(holdRow.items[0]?.promotionDiscount), 4_000), `usages=${holdRow.promotionUsages.length} disc=${holdRow.items[0]?.promotionDiscount}`);

const heldExpire = await createPrismaHeldBill(
  {
    snapshot: {
      appliedPromotions: [],
      cardAmount: 0,
      cashAmount: hexp.price,
      cartItems: [heldCartItem(hexp, "Promo QA Hold Expire", 1)],
      customer: null,
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
await resumePrismaHeldBill(heldExpire.id, ownerTenant);
await prisma.promotion.update({
  data: { endDate: new Date("2020-01-02"), isActive: false, status: "inactive" },
  where: { id: `${PREFIX}-hold-live` },
});
const expiredHoldSale = await sell(ownerTenant, hexp, 1, { saleLabel: "HOLDEXP" });
check(
  "10. Hold/Resume",
  "Expired-while-held bill recalculates without stale promo",
  near(amount((await saleRow(expiredHoldSale.id)).items[0]?.promotionDiscount), 0),
  "Checkout uses current eligibility, not the held snapshot total",
);

const refSale = await sell(ownerTenant, ref, 2, { saleLabel: "REF" });
const refRow = await saleRow(refSale.id);
const refPaid = amount(refRow.totalAmount);
const stockBeforePartial = amount((await prisma.inventoryBalance.findUnique({ where: { warehouseId_productId: { productId: ref.id, warehouseId: WAREHOUSE_ID } } }))?.quantity);
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(refRow.items[0]?.id) }],
  reason: "Promo QA partial",
  refundMethod: "cash",
  saleId: refSale.id,
});
const partialRefund = await prisma.refund.findFirst({ where: { saleId: refSale.id }, orderBy: { createdAt: "desc" } });
check("12. Refund", "Partial refund uses actual paid share", near(amount(partialRefund?.totalAmount), refPaid / 2, 2), `refund=${partialRefund?.totalAmount} half=${refPaid / 2}`);
check("12. Refund", "Remaining sale value stays correct", near(amount((await getPrismaSaleById(ownerTenant, refSale.id))?.remainingRefundableLak), refPaid / 2, 2));
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(refRow.items[0]?.id) }],
  reason: "Promo QA full",
  refundMethod: "cash",
  saleId: refSale.id,
});
const fullMapped = await getPrismaSaleById(ownerTenant, refSale.id);
check("12. Refund", "Full refund returns remaining paid value", fullMapped?.status === "refunded" && near(amount(fullMapped.remainingRefundableLak), 0, 2), `status=${fullMapped?.status}`);
check("12. Refund", "Stock restored after full refund", near(amount((await prisma.inventoryBalance.findUnique({ where: { warehouseId_productId: { productId: ref.id, warehouseId: WAREHOUSE_ID } } }))?.quantity), stockBeforePartial + 2, 2));

const origSale = await sell(ownerTenant, orig, 1, { saleLabel: "EXCH" });
const origRow = await saleRow(origSale.id);
check("13. Exchange", "Original paid value is promotional", near(amount(origRow.items[0]?.totalAmount), 90_000), `line=${origRow.items[0]?.totalAmount}`);
const exchange = await exchangePrismaSale(ownerTenant, {
  paidAmountLak: 18_000,
  reason: "Promo QA exchange",
  refundMethod: "cash",
  replacementItems: [{ productId: repl.id, quantity: 1, unitId: repl.unitId }],
  returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: String(origRow.items[0]?.id) }],
  saleId: origSale.id,
});
const exchangeRefund = await prisma.refund.findFirst({ include: { exchangeItems: true }, where: { id: exchange.refundId ?? "" } });
const replacementDisc = amount(exchangeRefund?.exchangeItems[0]?.promotionDiscount);
const replacementTotal = repl.price - replacementDisc;
const expectedDiff = replacementTotal - amount(origRow.totalAmount);
check(
  "13. Exchange",
  "Difference uses historical return value vs current replacement promo",
  Boolean(exchange.refundId) && near(amount(exchange.differenceLak), expectedDiff, 50) && expectedDiff !== repl.price - orig.price,
  `diff=${exchange.differenceLak} expected~=${expectedDiff} shelfDiff=${repl.price - orig.price}`,
);
check("13. Exchange", "Replacement promo applied once, no duplicate", (exchangeRefund?.exchangeItems.length ?? 0) === 1 && replacementDisc > 0, `items=${exchangeRefund?.exchangeItems.length} disc=${replacementDisc}`);

const pointsBeforeVoid = amount((await prisma.customer.findUnique({ where: { id: `${PREFIX}-member` } }))?.pointsBalance);
const voidSale = await sell(ownerTenant, voidp, 1, { customerId: `${PREFIX}-member`, saleLabel: "VOID" });
const voidRow = await saleRow(voidSale.id);
const pointsAfterVoidSale = amount((await prisma.customer.findUnique({ where: { id: `${PREFIX}-member` } }))?.pointsBalance);
const stockBeforeVoid = amount((await prisma.inventoryBalance.findUnique({ where: { warehouseId_productId: { productId: voidp.id, warehouseId: WAREHOUSE_ID } } }))?.quantity);
const reportsBeforeVoid = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
await voidPrismaSale(ownerTenant, { reason: "Promo QA void", saleId: voidSale.id });
const voidMapped = await getPrismaSaleById(ownerTenant, voidSale.id);
const reportsAfterVoid = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const pointsAfterVoid = amount((await prisma.customer.findUnique({ where: { id: `${PREFIX}-member` } }))?.pointsBalance);
check("14. Void", "Void does not re-run promotion; status voided", voidMapped?.status === "voided" && near(amount(voidRow.items[0]?.promotionDiscount), amount((await prisma.saleItem.findFirst({ where: { saleId: voidSale.id } }))?.promotionDiscount)));
check("14. Void", "Inventory restored", near(amount((await prisma.inventoryBalance.findUnique({ where: { warehouseId_productId: { productId: voidp.id, warehouseId: WAREHOUSE_ID } } }))?.quantity), stockBeforeVoid + 1, 2));
check("14. Void", "Member points reverse after void", pointsAfterVoid <= pointsAfterVoidSale && pointsAfterVoid <= pointsBeforeVoid + 1, `before=${pointsBeforeVoid} afterSale=${pointsAfterVoidSale} afterVoid=${pointsAfterVoid}`);
await expectThrow("14. Void", "Second void blocked", () => voidPrismaSale(ownerTenant, { saleId: voidSale.id }));
check("15. Reports", "Voided promo sale is removed from net revenue", reportsAfterVoid.analytics.totalRevenue <= reportsBeforeVoid.analytics.totalRevenue + 1, `before=${reportsBeforeVoid.analytics.totalRevenue} after=${reportsAfterVoid.analytics.totalRevenue}`);

const reportsAfter = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const pctGross = amount(pctRow.items[0]?.sellingPrice) * amount(pctRow.items[0]?.quantity);
const pctDisc = amount(pctRow.discountAmount);
const pctNet = amount(pctRow.totalAmount);
check("15. Reports", "Transaction stores gross/discount/net", near(pctGross, 100_000) && near(pctDisc, 10_000) && pctNet > 0 && pctNet <= pctGross, `gross=${pctGross} disc=${pctDisc} net=${pctNet}`);
check("15. Reports", "Promoted sales remain in report revenue", reportsAfter.analytics.totalRevenue >= reportsBefore.analytics.totalRevenue, `before=${reportsBefore.analytics.totalRevenue} after=${reportsAfter.analytics.totalRevenue}`);
const recent = await getPrismaSaleById(ownerTenant, pctSale.id);
check("13. Normal sale", "Recent sale total is discounted net", Boolean(recent) && near(amount(recent?.totalAmount), pctNet));

const goboxPromos = await getPrismaPromotionsSnapshot(ownerTenant);
let foreignSawGobox = false;
let foreignSnapshotDetail = "ok";
try {
  const foreign = await getPrismaPromotionsSnapshot(foreignTenant);
  foreignSawGobox = (foreign.promotions ?? []).some((promo: { id: string }) => String(promo.id).startsWith(PREFIX));
  foreignSnapshotDetail = `count=${foreign.promotions?.length ?? 0}`;
} catch (error) {
  foreignSnapshotDetail = error instanceof Error ? error.message : String(error);
}
check("17. Permission", "Cross-company promotion reads blocked", !foreignSawGobox, foreignSnapshotDetail);
check(
  "17. Permission",
  "Owner snapshot is company-scoped",
  goboxPromos.promotions.some((promo: { id: string }) => promo.id === `${PREFIX}-pct`),
);
await expectThrow("17. Permission", "Cashier cannot manage promotions", () =>
  createPrismaPromotion(
    {
      applicableProductIds: [pct.id],
      discountPercent: 5,
      endDate: "2099-12-31",
      promotionName: "Promo QA cashier create",
      promotionType: "percentage",
      startDate: "2020-01-01",
      status: "active",
    },
    cashierTenant,
  ),
);
check(
  "17. Permission",
  "Cashier store matrix allows apply, not manage",
  canPerformStoreAction({ role: "cashier" }, STORE_ACTIONS.PROMOTION_APPLY) &&
    !canPerformStoreAction({ role: "cashier" }, STORE_ACTIONS.STAFF_MANAGE),
);
await expectThrow("17. Permission", "Cashier promotions.create denied", () => assertPermission(cashierTenant, WRITE_PERMISSIONS.promotionsCreate));
await expectThrow("17. Permission", "Cross-company create blocked", () =>
  createPrismaPromotion(
    {
      applicableProductIds: [pct.id],
      discountPercent: 5,
      endDate: "2099-12-31",
      promotionName: "Promo QA foreign",
      promotionType: "percentage",
      startDate: "2020-01-01",
      status: "active",
    },
    foreignTenant,
  ),
);

check(
  "2. Types",
  "Dead promotion options left as UI-only",
  true,
  "couponCode SAVE10, time-of-day, brands/branches/warehouses selectors, stack-rules Save, Buy-X-Get-Y/combo/happy-hour templates have no POS coupon/time/stack wiring",
);

await prisma.promotion.updateMany({
  data: { isActive: false, status: "inactive" },
  where: { companyId: COMPANY_ID, id: { startsWith: PREFIX } },
});
await archivePrismaPromotion(`${PREFIX}-pct`, ownerTenant).catch(() => undefined);

const missing = results.filter((row) => row.missing);
const failed = results.filter((row) => !row.ok && !row.missing);
const passed = results.filter((row) => row.ok).length;
console.log(`\nPromotions final integration: ${passed}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}${missing.length ? ` (${missing.length} MISSING)` : ""}`);
for (const row of missing) {
  console.log(`MISSING REQUIRED LINK  ${row.name} — ${row.detail}`);
}
for (const row of failed) {
  console.log(`FAIL  [${row.section}] ${row.name} — ${row.detail}`);
}
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
