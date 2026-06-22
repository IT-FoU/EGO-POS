import { existsSync, readFileSync } from "node:fs";

// Force production writes BEFORE loading env files (loader only sets unset keys).
process.env.IGO_DEMO_MODE = "false";

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split("\n")) {
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
    if (!process.env[key]) process.env[key] = value;
  }
}

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const {
  createPurchaseOrder,
  createSupplierPayment,
  receiveGoods,
  updatePurchaseOrderStatus,
} = await import("../features/purchasing/prisma-repository");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const COMPANY_ID = "gobox-company";
const WAREHOUSE_ID = "gobox-default-warehouse";
const EPS = 0.01;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function near(a: number, b: number) {
  return Math.abs(a - b) <= EPS;
}
async function expectThrow(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    check(name, true, error instanceof Error ? error.message : String(error));
  }
}
async function payableFor(purchaseId: string) {
  return prisma.supplierPayable.findFirst({ where: { companyId: COMPANY_ID, purchaseId } });
}
async function payableCount(purchaseId: string) {
  return prisma.supplierPayable.count({ where: { companyId: COMPANY_ID, purchaseId } });
}
async function supplierOutstanding(supplierId: string) {
  const s = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  return Number(s.outstandingBalance);
}

const user = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const supplier = await prisma.supplier.findFirst({ where: { companyId: COMPANY_ID } });
const product = await prisma.product.findFirst({ include: { units: true }, where: { companyId: COMPANY_ID } });
if (!user || !supplier || !product) {
  console.error("Missing seed data. Run: npm run db:seed:demo");
  process.exit(1);
}
const unit = product.units.find((u: any) => u.isBaseUnit) ?? product.units[0];
const unitId: string | undefined = unit?.id;

const tenant = {
  branchId: "gobox-main-branch",
  companyId: COMPANY_ID,
  userId: user.id,
  warehouseId: WAREHOUSE_ID,
};

const baselineOutstanding = await supplierOutstanding(supplier.id);

// A. Create PO 1,000,000 (1000 units x 1000).
const created: any = await createPurchaseOrder(
  {
    currency: "LAK",
    exchangeRate: 1,
    items: [{ productId: product.id, quantity: 1000, unitCost: 1000, unitId }],
    supplierId: supplier.id,
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
const poId: string = created.id;
const purchaseItemId: string = created.items[0].id;
await updatePurchaseOrderStatus({ purchaseId: poId, status: "ordered" }, tenant);
check("A. PO total is 1,000,000", near(Number(created.totalAmount), 1_000_000), `total=${created.totalAmount}`);

// B. Receive 50% (500 units).
await receiveGoods(
  {
    items: [{ productId: product.id, purchaseItemId, quantity: 500, unitId }],
    purchaseId: poId,
    receiptNo: `GR-B73-${Date.now()}-A`,
    status: "received",
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
const payable1 = await payableFor(poId);
// C. Verify payable 500,000.
check("C. Payable total after 50% = 500,000", payable1 ? near(Number(payable1.totalAmount), 500_000) : false, `total=${payable1?.totalAmount}`);
check("C. Payable balance after 50% = 500,000", payable1 ? near(Number(payable1.balanceAmount), 500_000) : false, `balance=${payable1?.balanceAmount}`);
check("C. Supplier outstanding +500,000", near(await supplierOutstanding(supplier.id), baselineOutstanding + 500_000), `outstanding=${await supplierOutstanding(supplier.id)}`);

// D. Receive remaining 50% (500 units).
await receiveGoods(
  {
    items: [{ productId: product.id, purchaseItemId, quantity: 500, unitId }],
    purchaseId: poId,
    receiptNo: `GR-B73-${Date.now()}-B`,
    status: "received",
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
const payable2 = await payableFor(poId);
// E. Verify payable 1,000,000.
check("E. Payable total after 100% = 1,000,000", payable2 ? near(Number(payable2.totalAmount), 1_000_000) : false, `total=${payable2?.totalAmount}`);
check("E. Payable balance after 100% = 1,000,000", payable2 ? near(Number(payable2.balanceAmount), 1_000_000) : false, `balance=${payable2?.balanceAmount}`);
check("E. Exactly one payable row (no duplicate)", (await payableCount(poId)) === 1, `count=${await payableCount(poId)}`);
check("E. Supplier outstanding +1,000,000", near(await supplierOutstanding(supplier.id), baselineOutstanding + 1_000_000), `outstanding=${await supplierOutstanding(supplier.id)}`);
check("E. PO status received", (await prisma.purchase.findUniqueOrThrow({ where: { id: poId } })).status === "received");

// F. Pay 300,000.
await createSupplierPayment({ amount: 300_000, purchaseId: poId }, tenant);
const payable3 = await payableFor(poId);
// G. Verify outstanding 700,000.
check("G. Payable balance after pay 300k = 700,000", payable3 ? near(Number(payable3.balanceAmount), 700_000) : false, `balance=${payable3?.balanceAmount}`);
check("G. Payable paid = 300,000 / status partial", payable3 ? near(Number(payable3.paidAmount), 300_000) && payable3.status === "partial" : false, `paid=${payable3?.paidAmount}, status=${payable3?.status}`);
check("G. Supplier outstanding = baseline + 700,000", near(await supplierOutstanding(supplier.id), baselineOutstanding + 700_000), `outstanding=${await supplierOutstanding(supplier.id)}`);

// H. Pay remaining 700,000.
await createSupplierPayment({ amount: 700_000, purchaseId: poId }, tenant);
const payable4 = await payableFor(poId);
// I. Verify outstanding 0.
check("I. Payable balance after full pay = 0", payable4 ? near(Number(payable4.balanceAmount), 0) : false, `balance=${payable4?.balanceAmount}`);
check("I. Payable status = paid", payable4 ? payable4.status === "paid" : false, `status=${payable4?.status}`);
check("I. Supplier outstanding back to baseline", near(await supplierOutstanding(supplier.id), baselineOutstanding), `outstanding=${await supplierOutstanding(supplier.id)}`);

// Payment history synchronized with payable.
const paymentTotal = (await prisma.purchasePayment.findMany({ where: { purchaseId: poId } }))
  .reduce((sum, p) => sum + Number(p.amount), 0);
check("Payment history total = payable paid", payable4 ? near(paymentTotal, Number(payable4.paidAmount)) : false, `payments=${paymentTotal}`);

// Negative: overpay rejected.
await expectThrow("Overpay beyond balance rejected", () =>
  createSupplierPayment({ amount: 1, purchaseId: poId }, tenant),
);

// Negative: payment before any receive rejected (no payable yet).
const noReceive: any = await createPurchaseOrder(
  {
    currency: "LAK",
    exchangeRate: 1,
    items: [{ productId: product.id, quantity: 1, unitCost: 1000, unitId }],
    supplierId: supplier.id,
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
await updatePurchaseOrderStatus({ purchaseId: noReceive.id, status: "ordered" }, tenant);
await expectThrow("Payment before receive is rejected (no payable)", () =>
  createSupplierPayment({ amount: 1000, purchaseId: noReceive.id }, tenant),
);
check("No payable created without receiving", (await payableCount(noReceive.id)) === 0, `count=${await payableCount(noReceive.id)}`);

// Multi-tenant isolation: a foreign tenant context must not touch this company's PO/payable.
const foreignTenant = {
  branchId: "foreign-branch",
  companyId: "foreign-company",
  userId: user.id,
  warehouseId: "foreign-warehouse",
};
await expectThrow("Foreign tenant cannot pay this company's PO", () =>
  createSupplierPayment({ amount: 1000, purchaseId: poId }, foreignTenant),
);
await expectThrow("Foreign tenant cannot receive against this company's PO", () =>
  receiveGoods(
    {
      items: [{ productId: product.id, purchaseItemId, quantity: 1, unitId }],
      purchaseId: poId,
      receiptNo: `GR-B73-FOREIGN-${Date.now()}`,
      status: "received",
      warehouseId: "foreign-warehouse",
    },
    foreignTenant,
  ),
);
const outstandingAfterForeign = await supplierOutstanding(supplier.id);
check("Foreign attempts did not change supplier outstanding", near(outstandingAfterForeign, baselineOutstanding), `outstanding=${outstandingAfterForeign}`);

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\nB7-3 payable: ${passed}/${results.length} PASS, ${failed} FAIL`);

await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
