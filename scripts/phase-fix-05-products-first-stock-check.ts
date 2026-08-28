import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  getPrismaReceivableCatalogItems,
  mergeQuickStockInCatalog,
  writeStockIn,
} from "../features/inventory/prisma-repository";
import {
  findPrismaProductByBarcode,
  getPrismaProductById,
  getPrismaProducts,
  writePrismaProductArchive,
  writePrismaProductCreate,
  writePrismaProductUpdate,
} from "../features/products/prisma-repository";
import type { TenantContext } from "../lib/db/write-context";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";

class RollbackError extends Error {
  constructor() {
    super("FIX-05 isolated fixture rollback");
    this.name = "RollbackError";
  }
}

function loadEnv() {
  for (const fileName of [".env", ".env.local"]) {
    if (!existsSync(fileName)) continue;
    for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();
process.env.IGO_DEMO_MODE = "false";

function qty(value: unknown) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: unknown, expected: number, message: string) {
  const value = qty(actual);
  if (Math.abs(value - expected) > 1e-9) {
    throw new Error(`${message}: expected ${expected}, got ${value}`);
  }
}

function matchesClientSearch(
  product: {
    barcode?: string;
    nameEn?: string;
    nameLo?: string;
    productCode?: string;
    sku?: string;
    units?: Array<{ barcode?: string }>;
  },
  query: string,
) {
  const term = query.trim().toLowerCase();
  return [
    product.barcode,
    product.sku,
    product.productCode,
    product.nameLo,
    product.nameEn,
    ...(product.units ?? []).map((unit) => unit.barcode),
  ]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

type Tx = any;

async function goboxCounts(prisma: PrismaClient) {
  const company = await prisma.company.findFirst({ where: { storeCode: "0001" } });
  if (!company) throw new Error("GO BOX company storeCode 0001 was not found.");
  const [products, balances, lots, movements] = await Promise.all([
    prisma.product.count({ where: { companyId: company.id } }),
    prisma.inventoryBalance.count({ where: { companyId: company.id } }),
    prisma.inventoryLot.count({ where: { companyId: company.id } }),
    prisma.stockMovement.count({ where: { companyId: company.id } }),
  ]);
  return { balances, companyId: company.id, lots, movements, products };
}

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const storeCode = `e5${token}`;
  const user = await tx.user.create({
    data: {
      fullName: `FIX-05 ${label}`,
      passwordHash: "isolated-fixture",
      username: `e5u${token}`,
    },
  });
  const company = await tx.company.create({
    data: {
      businessTemplateKey: "mini-mart",
      name: `FIX-05 ${label}`,
      ownerUserId: user.id,
      storeCode,
    },
  });
  const branch = await tx.branch.create({
    data: { companyId: company.id, isMainBranch: true, name: "Main" },
  });
  const warehouseA = await tx.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH-A", type: "store" },
  });
  const warehouseB = await tx.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH-B", type: "store" },
  });
  await tx.companyUser.create({
    data: {
      branchId: branch.id,
      companyId: company.id,
      isOwner: true,
      status: "active",
      userId: user.id,
    },
  });

  const tenant: TenantContext = {
    branchId: branch.id,
    companyId: company.id,
    userId: user.id,
    warehouseId: warehouseA.id,
  };

  return { storeCode, tenant, warehouseAId: warehouseA.id, warehouseBId: warehouseB.id };
}

async function expectError(run: () => Promise<unknown>, includes: string) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof RollbackError) throw error;
    assert(message.toLowerCase().includes(includes.toLowerCase()), `Expected "${includes}", got "${message}"`);
    return;
  }
  throw new Error(`Expected error containing "${includes}"`);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  assert(url.includes(TARGET_REF), "Refusing non-Production database");
  assert(!url.includes(GOFLO_REF) && !url.includes(OLD_PRO_REF), "Refusing inactive PRO or GoFLO database");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } }),
  });

  const before = await goboxCounts(prisma);
  const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];

  async function isolated(name: string, run: (tx: Tx) => Promise<void>) {
    try {
      await prisma.$transaction(async (tx) => {
        await run(tx);
        throw new RollbackError();
      });
    } catch (error) {
      if (error instanceof RollbackError) {
        results.push({ name, status: "PASS" });
        return;
      }
      results.push({
        detail: error instanceof Error ? error.message : String(error),
        name,
        status: "FAIL",
      });
    }
  }

  const productInput = {
    barcode: "0012345678901",
    costPriceLak: 1000,
    nameEn: "UAT Product Fixture",
    nameLo: "UAT Product Fixture",
    sellingPriceLak: 1500,
    sku: "UAT-SKU-001",
    units: [
      {
        barcode: "0012345678901",
        conversionQty: 1,
        costPriceLak: 1000,
        isBaseUnit: true,
        isPurchaseUnit: true,
        sellingPriceLak: 1500,
        unitName: "Piece",
      },
      {
        barcode: "0012345678918",
        conversionQty: 10,
        costPriceLak: 10000,
        isBaseUnit: false,
        isPurchaseUnit: true,
        sellingPriceLak: 14000,
        unitName: "Pack",
      },
    ],
  };

  await isolated("1. Create normal product", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "create");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    assert(created.sku === "UAT-SKU-001", "SKU not persisted");
    assert(created.barcode === "0012345678901", "Leading-zero barcode corrupted");
    assertClose(created.currentStock, 0, "Create must not write stock");
    JSON.parse(JSON.stringify(created));
    const listed = await getPrismaProducts(tenant, tx);
    assert(listed.some((row) => row.id === created.id), "Created product missing from list");
  });

  await isolated("2. Create duplicate SKU", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "dup-sku");
    await writePrismaProductCreate(tx, productInput, tenant);
    await expectError(
      () => writePrismaProductCreate(tx, { nameLo: "Dup SKU", sellingPriceLak: 1, sku: "UAT-SKU-001" }, tenant),
      "SKU already exists",
    );
  });

  await isolated("3. Create duplicate barcode", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "dup-bc");
    await writePrismaProductCreate(tx, productInput, tenant);
    await expectError(
      () =>
        writePrismaProductCreate(
          tx,
          { barcode: "0012345678901", nameLo: "Dup barcode", sellingPriceLak: 1, sku: "UAT-SKU-DUP-BC" },
          tenant,
        ),
      "Barcode already exists",
    );
  });

  await isolated("4. Search exact barcode", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "search-bc");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    const lookup = await findPrismaProductByBarcode("0012345678901", tenant, tx);
    assert(lookup?.productId === created.id, "Barcode lookup missed product");
    const listed = (await getPrismaProducts(tenant, tx)).filter((row) => matchesClientSearch(row, "0012345678901"));
    assert(listed.some((row) => row.id === created.id), "List search missed exact barcode");
  });

  await isolated("5. Search exact SKU", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "search-sku");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    const listed = (await getPrismaProducts(tenant, tx)).filter((row) => matchesClientSearch(row, "UAT-SKU-001"));
    assert(listed.some((row) => row.id === created.id), "SKU search missed product");
  });

  await isolated("6. Search full name", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "search-name");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    const listed = (await getPrismaProducts(tenant, tx)).filter((row) =>
      matchesClientSearch(row, "UAT Product Fixture"),
    );
    assert(listed.some((row) => row.id === created.id), "Full name search missed product");
  });

  await isolated("7. Search partial name", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "search-partial");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    const listed = (await getPrismaProducts(tenant, tx)).filter((row) => matchesClientSearch(row, "UAT Product"));
    assert(listed.some((row) => row.id === created.id), "Partial name search missed product");
  });

  await isolated("8. Edit product", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "edit");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    const updated = await writePrismaProductUpdate(
      tx,
      created.id,
      { nameEn: "UAT Product Fixture Edited", sellingPriceLak: 1800 },
      tenant,
    );
    assert(updated.nameEn === "UAT Product Fixture Edited", "Name not updated");
    assertClose(updated.sellingPriceLak, 1800, "Price not updated");
  });

  await isolated("9. Archive product", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "archive");
    const extra = await writePrismaProductCreate(
      tx,
      { barcode: "0099999999999", nameLo: "Archive me", sellingPriceLak: 1, sku: "UAT-SKU-ARCH" },
      tenant,
    );
    const archived = await writePrismaProductArchive(tx, extra.id, tenant);
    assert(archived.status === "deleted", "Archive must set status deleted");
  });

  await isolated("10. Archived product behavior", async (tx) => {
    const { tenant, warehouseAId } = await createIsolatedTenant(tx, "archived-recv");
    const extra = await writePrismaProductCreate(
      tx,
      { barcode: "0099999999998", nameLo: "Archive recv", sellingPriceLak: 1, sku: "UAT-SKU-ARCH2" },
      tenant,
    );
    await writePrismaProductArchive(tx, extra.id, tenant);
    const catalog = await getPrismaReceivableCatalogItems(tenant, tx);
    assert(!catalog.some((item) => item.productId === extra.id), "Archived product leaked into receiving catalog");
    await expectError(
      () => writeStockIn(tx, { productId: extra.id, quantity: 1, warehouseId: warehouseAId }, tenant),
      "not available",
    );
  });

  await isolated("11. First receiving from zero stock", async (tx) => {
    const { tenant, warehouseAId } = await createIsolatedTenant(tx, "first-stock");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    const catalog = await getPrismaReceivableCatalogItems(tenant, tx);
    const merged = mergeQuickStockInCatalog([], catalog);
    assert(merged.some((item) => item.productId === created.id && item.quantity === 0), "Zero-stock product not receivable");
    const piece = created.units.find((unit) => unit.isBaseUnit) ?? created.units[0];
    await writeStockIn(
      tx,
      {
        productId: created.id,
        quantity: 10,
        stockInNo: "SI-UAT-FIRST",
        unitId: piece.id,
        warehouseId: warehouseAId,
      },
      tenant,
    );
    const after = await getPrismaProductById(created.id, tenant, tx);
    assertClose(after?.currentStock, 10, "Balance after first receive");
  });

  await isolated("12. First receiving with lot", async (tx) => {
    const { tenant, warehouseAId } = await createIsolatedTenant(tx, "lot");
    const lotProduct = await writePrismaProductCreate(
      tx,
      { barcode: "0088888888888", nameLo: "Lot product", sellingPriceLak: 2, sku: "UAT-SKU-LOT" },
      tenant,
    );
    await writeStockIn(
      tx,
      {
        expiryDate: "2026-12-31",
        lotNumber: "LOT-UAT-1",
        productId: lotProduct.id,
        quantity: 10,
        stockInNo: "SI-UAT-LOT",
        unitId: lotProduct.units[0].id,
        warehouseId: warehouseAId,
      },
      tenant,
    );
    const balance = await tx.inventoryBalance.findUnique({
      where: { warehouseId_productId: { productId: lotProduct.id, warehouseId: warehouseAId } },
    });
    const lots = await tx.inventoryLot.findMany({
      where: { productId: lotProduct.id, warehouseId: warehouseAId },
    });
    const lotTotal = lots.reduce((total: number, row: { quantity: unknown }) => total + qty(row.quantity), 0);
    assertClose(balance?.quantity, 10, "Lot receive balance");
    assertClose(lotTotal, 10, "Lot total must match balance");
  });

  await isolated("13. First receiving without lot where supported", async (tx) => {
    const { tenant, warehouseAId } = await createIsolatedTenant(tx, "no-lot");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    const piece = created.units.find((unit) => unit.isBaseUnit) ?? created.units[0];
    await writeStockIn(
      tx,
      {
        productId: created.id,
        quantity: 10,
        stockInNo: "SI-UAT-NOLOT",
        unitId: piece.id,
        warehouseId: warehouseAId,
      },
      tenant,
    );
    const lots = await tx.inventoryLot.findMany({
      where: { productId: created.id, warehouseId: warehouseAId },
    });
    assert(lots.length === 0, "Balance-only receive must not invent lots");
    const movement = await tx.stockMovement.findFirst({
      where: { productId: created.id, referenceType: "quick_stock_in" },
    });
    assert(movement, "Stock movement missing for balance-only receive");
    assertClose(movement.quantity, 10, "Movement quantity");
  });

  await isolated("14. Second receiving", async (tx) => {
    const { tenant, warehouseAId } = await createIsolatedTenant(tx, "second");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    const piece = created.units.find((unit) => unit.isBaseUnit) ?? created.units[0];
    await writeStockIn(
      tx,
      { productId: created.id, quantity: 10, stockInNo: "SI-UAT-A", unitId: piece.id, warehouseId: warehouseAId },
      tenant,
    );
    await writeStockIn(
      tx,
      { productId: created.id, quantity: 5, stockInNo: "SI-UAT-B", unitId: piece.id, warehouseId: warehouseAId },
      tenant,
    );
    const after = await getPrismaProductById(created.id, tenant, tx);
    assertClose(after?.currentStock, 15, "Second receive balance");
  });

  await isolated("15. Wrong warehouse access denied", async (tx) => {
    const isolatedTenant = await createIsolatedTenant(tx, "wh-a");
    const foreign = await createIsolatedTenant(tx, "wh-b");
    const created = await writePrismaProductCreate(tx, productInput, isolatedTenant.tenant);
    const piece = created.units.find((unit) => unit.isBaseUnit) ?? created.units[0];
    await expectError(
      () =>
        writeStockIn(
          tx,
          { productId: created.id, quantity: 1, unitId: piece.id, warehouseId: foreign.warehouseAId },
          isolatedTenant.tenant,
        ),
      "warehouse",
    );
  });

  await isolated("16. Wrong tenant access denied", async (tx) => {
    const isolatedTenant = await createIsolatedTenant(tx, "ten-a");
    const foreign = await createIsolatedTenant(tx, "ten-b");
    const created = await writePrismaProductCreate(tx, productInput, isolatedTenant.tenant);
    const piece = created.units.find((unit) => unit.isBaseUnit) ?? created.units[0];
    await expectError(
      () =>
        writeStockIn(
          tx,
          { productId: created.id, quantity: 1, unitId: piece.id, warehouseId: foreign.warehouseAId },
          foreign.tenant,
        ),
      "not found",
    );
    const foreignList = await getPrismaProducts(foreign.tenant, tx);
    assert(!foreignList.some((row) => row.id === created.id), "Product leaked across tenant");
  });

  await isolated("17. Invalid price/quantity validation", async (tx) => {
    const { tenant, warehouseAId } = await createIsolatedTenant(tx, "invalid");
    await expectError(
      () => writePrismaProductCreate(tx, { nameLo: "Bad price", sellingPriceLak: -10, sku: "UAT-SKU-BAD" }, tenant),
      "greater than or equal to zero",
    );
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    const piece = created.units.find((unit) => unit.isBaseUnit) ?? created.units[0];
    await expectError(
      () => writeStockIn(tx, { productId: created.id, quantity: 0, unitId: piece.id, warehouseId: warehouseAId }, tenant),
      "greater than",
    );
  });

  await isolated("18. Unit/package mapping", async (tx) => {
    const { tenant, warehouseAId } = await createIsolatedTenant(tx, "pack");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    const pack = created.units.find((unit) => unit.unitName === "Pack");
    assert(pack, "Pack unit missing");
    await writeStockIn(
      tx,
      {
        productId: created.id,
        quantity: 1,
        stockInNo: "SI-UAT-PACK",
        unitId: pack.id,
        warehouseId: warehouseAId,
      },
      tenant,
    );
    const after = await getPrismaProductById(created.id, tenant, tx);
    assertClose(after?.currentStock, 10, "Pack conversion 1x10");
    const sellable = await tx.product.findFirst({
      where: {
        balances: { some: { warehouseId: warehouseAId } },
        id: created.id,
        isActive: true,
      },
    });
    assert(sellable, "Product not resolvable by POS sell lookup after first stock");
  });

  const after = await goboxCounts(prisma);
  const leaked = await prisma.company.count({
    where: { storeCode: { startsWith: "e5" }, NOT: { id: before.companyId } },
  });
  await prisma.$disconnect();

  assert(leaked === 0, `Isolated fixtures leaked ${leaked} companies`);
  assert(after.products === before.products, "GO BOX product count changed");
  assert(after.balances === before.balances, "GO BOX balance count changed");
  assert(after.lots === before.lots, "GO BOX lot count changed");
  assert(after.movements === before.movements, "GO BOX movement count changed");

  const failed = results.filter((row) => row.status === "FAIL");
  console.log(
    JSON.stringify(
      {
        failed: failed.length,
        gobox: after,
        passed: results.filter((row) => row.status === "PASS").length,
        results,
        total: results.length,
      },
      null,
      2,
    ),
  );
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
