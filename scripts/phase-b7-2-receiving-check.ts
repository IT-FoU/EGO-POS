import { existsSync, readFileSync } from "node:fs";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
const SCRIPT_DATABASE_URL = resolveScriptDatabaseUrl("test-write");

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
  receiveGoods,
  updatePurchaseOrderStatus,
} = await import("../features/purchasing/prisma-repository");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: SCRIPT_DATABASE_URL }) });

const COMPANY_ID = "gobox-company";
const WAREHOUSE_ID = "gobox-default-warehouse";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
async function expectThrow(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    check(name, true, error instanceof Error ? error.message : String(error));
  }
}
async function purchaseStatus(id: string): Promise<string> {
  return (await prisma.purchase.findUniqueOrThrow({ where: { id } })).status;
}
async function stockQty(productId: string): Promise<number> {
  const row = await prisma.inventoryBalance.findUnique({
    where: { warehouseId_productId: { productId, warehouseId: WAREHOUSE_ID } },
  });
  return row ? Number(row.quantity) : 0;
}

const user = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const supplier = await prisma.supplier.findFirst({ where: { companyId: COMPANY_ID } });
// Prefer a product that has a non-base unit with conversion > 1 so we exercise pack/carton conversion.
const products = await prisma.product.findMany({
  include: { units: true },
  where: { companyId: COMPANY_ID },
});
if (!user || !supplier || products.length === 0) {
  console.error("Missing seed data. Run: npm run db:seed:demo");
  process.exit(1);
}

let chosen: { productId: string; unitId: string | undefined; conversionQty: number } | null = null;
for (const product of products) {
  const packUnit = product.units.find((unit: any) => Number(unit.conversionQty) > 1);
  if (packUnit) {
    chosen = { conversionQty: Number(packUnit.conversionQty), productId: product.id, unitId: packUnit.id };
    break;
  }
}
if (!chosen) {
  const product = products.find((p: any) => p.units.length > 0) ?? products[0];
  const unit = product.units[0];
  chosen = { conversionQty: unit ? Number(unit.conversionQty) : 1, productId: product.id, unitId: unit?.id };
}

const tenant = {
  branchId: "gobox-main-branch",
  companyId: COMPANY_ID,
  userId: user.id,
  warehouseId: WAREHOUSE_ID,
};

const { productId, unitId, conversionQty } = chosen;
console.log(`Using product=${productId} unit=${unitId ?? "(base)"} conversionQty=${conversionQty}`);
check("Conversion factor is positive", conversionQty > 0, `conversionQty=${conversionQty}`);

const ORDER_QTY = 6;
const PARTIAL_QTY = 2;
const REMAIN_QTY = 4;

// Create PO and send to ordered.
const created: any = await createPurchaseOrder(
  {
    currency: "LAK",
    exchangeRate: 1,
    items: [{ productId, quantity: ORDER_QTY, unitCost: 1000, unitId }],
    supplierId: supplier.id,
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
const poId: string = created.id;
const purchaseItemId: string = created.items[0].id;
await updatePurchaseOrderStatus({ purchaseId: poId, status: "ordered" }, tenant);
check("PO is ordered before receiving", (await purchaseStatus(poId)) === "ordered");

const baseline = await stockQty(productId);

// Receive partial.
const receiptA: any = await receiveGoods(
  {
    items: [{ productId, purchaseItemId, quantity: PARTIAL_QTY, unitId }],
    purchaseId: poId,
    receiptNo: `GR-B72-${Date.now()}-A`,
    status: "received",
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
const afterPartial = await stockQty(productId);
check("Partial receive sets status partial", (await purchaseStatus(poId)) === "partial");
check(
  "Partial receive increases base stock by qty*conversion",
  afterPartial === baseline + PARTIAL_QTY * conversionQty,
  `expected +${PARTIAL_QTY * conversionQty}, got +${afterPartial - baseline}`,
);

// Stock movement traceability for receipt A.
const moveA = await prisma.stockMovement.findFirst({
  where: { productId, referenceId: receiptA.id, referenceType: "goods_receipt" },
});
check("Receipt A has traceable stock movement", Boolean(moveA), `referenceId=${receiptA.id}`);
check(
  "Stock movement A quantity equals base quantity",
  moveA ? Number(moveA.quantity) === PARTIAL_QTY * conversionQty : false,
  moveA ? `quantity=${moveA.quantity}` : "no movement",
);
check("Stock movement A is positive (no negative)", moveA ? Number(moveA.quantity) > 0 : false);

// Receive remaining.
const receiptB: any = await receiveGoods(
  {
    items: [{ productId, purchaseItemId, quantity: REMAIN_QTY, unitId }],
    purchaseId: poId,
    receiptNo: `GR-B72-${Date.now()}-B`,
    status: "received",
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
const afterFull = await stockQty(productId);
check("Remaining receive sets status received", (await purchaseStatus(poId)) === "received");
check(
  "Full receive total base stock = order*conversion",
  afterFull === baseline + ORDER_QTY * conversionQty,
  `expected +${ORDER_QTY * conversionQty}, got +${afterFull - baseline}`,
);

// No duplicate movements: exactly one movement per receipt.
const moveCountA = await prisma.stockMovement.count({ where: { referenceId: receiptA.id, referenceType: "goods_receipt" } });
const moveCountB = await prisma.stockMovement.count({ where: { referenceId: receiptB.id, referenceType: "goods_receipt" } });
check("Exactly one movement per receipt (no duplicates)", moveCountA === 1 && moveCountB === 1, `A=${moveCountA}, B=${moveCountB}`);

// Duplicate / over-receive must not double-count stock.
const beforeDup = await stockQty(productId);
await expectThrow("Over-receive beyond ordered is rejected", () =>
  receiveGoods(
    {
      items: [{ productId, purchaseItemId, quantity: 1, unitId }],
      purchaseId: poId,
      receiptNo: `GR-B72-${Date.now()}-DUP`,
      status: "received",
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  ),
);
check("Stock unchanged after rejected over-receive", (await stockQty(productId)) === beforeDup, `stock=${await stockQty(productId)}`);

// Received PO cannot be received again.
await expectThrow("Received PO cannot be received", () =>
  receiveGoods(
    {
      items: [{ productId, purchaseItemId, quantity: 1, unitId }],
      purchaseId: poId,
      receiptNo: `GR-B72-${Date.now()}-RCV`,
      status: "received",
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  ),
);

// Draft PO cannot be received.
const draft: any = await createPurchaseOrder(
  {
    currency: "LAK",
    exchangeRate: 1,
    items: [{ productId, quantity: 1, unitCost: 500, unitId }],
    supplierId: supplier.id,
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
await expectThrow("Draft PO cannot be received", () =>
  receiveGoods(
    {
      items: [{ productId, purchaseItemId: draft.items[0].id, quantity: 1, unitId }],
      purchaseId: draft.id,
      receiptNo: `GR-B72-${Date.now()}-DRAFT`,
      status: "received",
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  ),
);

// Cancelled PO cannot be received.
await updatePurchaseOrderStatus({ purchaseId: draft.id, status: "cancelled" }, tenant);
await expectThrow("Cancelled PO cannot be received", () =>
  receiveGoods(
    {
      items: [{ productId, purchaseItemId: draft.items[0].id, quantity: 1, unitId }],
      purchaseId: draft.id,
      receiptNo: `GR-B72-${Date.now()}-CANC`,
      status: "received",
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  ),
);

// Closed PO cannot be received.
const closable: any = await createPurchaseOrder(
  {
    currency: "LAK",
    exchangeRate: 1,
    items: [{ productId, quantity: 1, unitCost: 500, unitId }],
    supplierId: supplier.id,
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
await updatePurchaseOrderStatus({ purchaseId: closable.id, status: "ordered" }, tenant);
await receiveGoods(
  {
    items: [{ productId, purchaseItemId: closable.items[0].id, quantity: 1, unitId }],
    purchaseId: closable.id,
    receiptNo: `GR-B72-${Date.now()}-CLOSE`,
    status: "received",
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
await updatePurchaseOrderStatus({ purchaseId: closable.id, status: "closed" }, tenant);
await expectThrow("Closed PO cannot be received", () =>
  receiveGoods(
    {
      items: [{ productId, purchaseItemId: closable.items[0].id, quantity: 1, unitId }],
      purchaseId: closable.id,
      receiptNo: `GR-B72-${Date.now()}-CLOSE2`,
      status: "received",
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  ),
);

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\nB7-2 receiving: ${passed}/${results.length} PASS, ${failed} FAIL`);

await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
