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
  const row = await prisma.purchase.findUniqueOrThrow({ where: { id } });
  return row.status;
}

async function stockQty(productId: string): Promise<number> {
  const row = await prisma.inventoryBalance.findUnique({
    where: { warehouseId_productId: { productId, warehouseId: WAREHOUSE_ID } },
  });
  return row ? Number(row.quantity) : 0;
}

const user = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const supplier = await prisma.supplier.findFirst({ where: { companyId: COMPANY_ID } });
const product = await prisma.product.findFirst({
  include: { units: true },
  where: { companyId: COMPANY_ID },
});

if (!user || !supplier || !product) {
  console.error("Missing seed data (user/supplier/product). Run: npm run db:seed:demo");
  process.exit(1);
}

const tenant = {
  branchId: "gobox-main-branch",
  companyId: COMPANY_ID,
  userId: user.id,
  warehouseId: WAREHOUSE_ID,
};

const unitId = product.units[0]?.id;

// 1. Create PO (draft) with server-generated purchaseNo.
const created: any = await createPurchaseOrder(
  {
    currency: "LAK",
    exchangeRate: 1,
    items: [{ productId: product.id, quantity: 4, unitCost: 1000, unitId }],
    supplierId: supplier.id,
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
check("Create PO returns draft status", created.status === "draft", `status=${created.status}`);
check("Create PO assigns purchase number", Boolean(created.purchaseNo), `purchaseNo=${created.purchaseNo}`);

const poId: string = created.id;
const purchaseItemId: string = created.items[0].id;
const baselineStock = await stockQty(product.id);

// 2. Send: draft -> ordered.
await updatePurchaseOrderStatus({ purchaseId: poId, status: "ordered" }, tenant);
check("Send PO -> ordered", (await purchaseStatus(poId)) === "ordered");

// 3. Receive partial (2 of 4) -> partial.
await receiveGoods(
  {
    items: [{ productId: product.id, purchaseItemId, quantity: 2, unitId }],
    purchaseId: poId,
    receiptNo: `GR-B71-${Date.now()}-A`,
    status: "received",
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
check("Receive partial -> partial status", (await purchaseStatus(poId)) === "partial");
check("Partial receive increases stock by 2", (await stockQty(product.id)) === baselineStock + 2, `stock=${await stockQty(product.id)}`);

// 4. Receive remaining (2 of 4) -> received.
await receiveGoods(
  {
    items: [{ productId: product.id, purchaseItemId, quantity: 2, unitId }],
    purchaseId: poId,
    receiptNo: `GR-B71-${Date.now()}-B`,
    status: "received",
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
check("Receive remaining -> received status", (await purchaseStatus(poId)) === "received");
check("Full receive increases stock by 4 total", (await stockQty(product.id)) === baselineStock + 4, `stock=${await stockQty(product.id)}`);

// 5. Close: received -> closed.
await updatePurchaseOrderStatus({ purchaseId: poId, status: "closed" }, tenant);
check("Close PO -> closed", (await purchaseStatus(poId)) === "closed");

// 6. Cancel flow on a fresh draft PO.
const created2: any = await createPurchaseOrder(
  {
    currency: "LAK",
    exchangeRate: 1,
    items: [{ productId: product.id, quantity: 1, unitCost: 500, unitId }],
    supplierId: supplier.id,
    warehouseId: WAREHOUSE_ID,
  },
  tenant,
);
await updatePurchaseOrderStatus({ purchaseId: created2.id, status: "cancelled" }, tenant);
check("Cancel draft PO -> cancelled", (await purchaseStatus(created2.id)) === "cancelled");

// 7. Negative cases — invalid transitions / receiving guard.
await expectThrow("Cannot receive a closed PO", () =>
  receiveGoods(
    {
      items: [{ productId: product.id, purchaseItemId, quantity: 1, unitId }],
      purchaseId: poId,
      receiptNo: `GR-B71-${Date.now()}-C`,
      status: "received",
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  ),
);
await expectThrow("Cannot transition closed -> ordered", () =>
  updatePurchaseOrderStatus({ purchaseId: poId, status: "ordered" }, tenant),
);
await expectThrow("Cannot cancel a cancelled PO", () =>
  updatePurchaseOrderStatus({ purchaseId: created2.id, status: "cancelled" }, tenant),
);

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\nB7-1 lifecycle: ${passed}/${results.length} PASS, ${failed} FAIL`);

await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
