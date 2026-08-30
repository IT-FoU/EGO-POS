import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  addPosCartLine,
  cartSubtotal,
  filterPosCatalogue,
  findPosScanMatch,
  maxSellQty,
  productWithSaleUnit,
  removePosCartLine,
  requiredBaseQty,
  updatePosCartQuantity,
  type AddPosCartResult,
} from "../features/pos/pos-cart";
import { listSellablePosProducts } from "../features/pos/prisma-repository";
import type { PosCartItem, PosProduct, PosProductUnit } from "../features/pos/types";
import {
  findPrismaProductByBarcode,
  writePrismaProductArchive,
  writePrismaProductCreate,
} from "../features/products/prisma-repository";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";

class RollbackError extends Error {
  constructor() {
    super("FIX-06 isolated fixture rollback");
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
loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

type Tx = any;

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

async function goboxCounts(prisma: PrismaClient) {
  const company = await prisma.company.findFirst({ where: { storeCode: "0001" } });
  if (!company) throw new Error("GO BOX company storeCode 0001 was not found.");
  const [products, balances, lots, movements, sales] = await Promise.all([
    prisma.product.count({ where: { companyId: company.id } }),
    prisma.inventoryBalance.count({ where: { companyId: company.id } }),
    prisma.inventoryLot.count({ where: { companyId: company.id } }),
    prisma.stockMovement.count({ where: { companyId: company.id } }),
    prisma.sale.count({ where: { companyId: company.id } }),
  ]);
  return { balances, companyId: company.id, lots, movements, products, sales };
}

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const storeCode = `e6${token}`;
  const user = await tx.user.create({
    data: {
      fullName: `FIX-06 ${label}`,
      passwordHash: "isolated-fixture",
      username: `e6u${token}`,
    },
  });
  const company = await tx.company.create({
    data: {
      businessTemplateKey: "mini-mart",
      name: `FIX-06 ${label}`,
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

function pieceInput(overrides: {
  barcode: string;
  nameEn: string;
  sellingPriceLak: number;
  sku: string;
  units?: Array<{
    barcode: string;
    conversionQty: number;
    isBaseUnit?: boolean;
    isDefaultSaleUnit?: boolean;
    sellingPriceLak: number;
    unitName: string;
  }>;
}) {
  return {
    barcode: overrides.barcode,
    costPriceLak: Math.round(overrides.sellingPriceLak * 0.6),
    nameEn: overrides.nameEn,
    nameLo: overrides.nameEn,
    sellingPriceLak: overrides.sellingPriceLak,
    sku: overrides.sku,
    units: overrides.units ?? [
      {
        barcode: overrides.barcode,
        conversionQty: 1,
        costPriceLak: Math.round(overrides.sellingPriceLak * 0.6),
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        isPurchaseUnit: true,
        sellingPriceLak: overrides.sellingPriceLak,
        unitName: "Piece",
      },
    ],
  };
}

async function setBalance(tx: Tx, tenant: TenantContext, productId: string, warehouseId: string, quantity: number) {
  await tx.inventoryBalance.upsert({
    create: {
      companyId: tenant.companyId,
      productId,
      quantity,
      warehouseId,
    },
    update: { quantity },
    where: { warehouseId_productId: { productId, warehouseId } },
  });
}

function toLine(product: PosProduct, unit?: PosProductUnit): PosCartItem {
  const priced = unit ? productWithSaleUnit(product, unit) : product;
  return {
    ...priced,
    quantity: 1,
    retailPriceLak: priced.priceLak,
  };
}

function scanOnce(cart: PosCartItem[], products: PosProduct[], query: string): AddPosCartResult & { found: boolean } {
  const match = findPosScanMatch(products, query);
  if (!match) {
    return { added: false, capped: false, cart, found: false };
  }
  return { ...addPosCartLine(cart, toLine(match.product, match.unit)), found: true };
}

function requireProduct(catalogue: PosProduct[], sku: string) {
  const product = catalogue.find((item) => item.sku === sku);
  assert(product, `POS catalogue missing ${sku}`);
  return product;
}

async function seedCore(tx: Tx) {
  const ctx = await createIsolatedTenant(tx, "core");
  const { tenant, warehouseAId } = ctx;

  const productA = await writePrismaProductCreate(
    tx,
    pieceInput({
      barcode: "0011111111111",
      nameEn: "EGO FIX06 Product Alpha",
      sellingPriceLak: 10000,
      sku: "E6-SKU-A",
    }),
    tenant,
  );
  const productB = await writePrismaProductCreate(
    tx,
    pieceInput({
      barcode: "0022222222222",
      nameEn: "EGO FIX06 Product Bravo",
      sellingPriceLak: 5000,
      sku: "E6-SKU-B",
    }),
    tenant,
  );
  const productC = await writePrismaProductCreate(
    tx,
    pieceInput({
      barcode: "0033333333333",
      nameEn: "EGO FIX06 Product Charlie Zero",
      sellingPriceLak: 2000,
      sku: "E6-SKU-C",
    }),
    tenant,
  );
  const productD = await writePrismaProductCreate(
    tx,
    pieceInput({
      barcode: "0044444444444",
      nameEn: "EGO FIX06 Product Delta Pack",
      sellingPriceLak: 1000,
      sku: "E6-SKU-D",
      units: [
        {
          barcode: "0044444444444",
          conversionQty: 1,
          isBaseUnit: true,
          isDefaultSaleUnit: true,
          sellingPriceLak: 1000,
          unitName: "Piece",
        },
        {
          barcode: "0044444444451",
          conversionQty: 12,
          isBaseUnit: false,
          isDefaultSaleUnit: false,
          sellingPriceLak: 11000,
          unitName: "Carton",
        },
      ],
    }),
    tenant,
  );
  const productE = await writePrismaProductCreate(
    tx,
    pieceInput({
      barcode: "0055555555555",
      nameEn: "EGO FIX06 Product Echo Archived",
      sellingPriceLak: 3000,
      sku: "E6-SKU-E",
    }),
    tenant,
  );

  await setBalance(tx, tenant, productA.id, warehouseAId, 10);
  await setBalance(tx, tenant, productB.id, warehouseAId, 10);
  await setBalance(tx, tenant, productC.id, warehouseAId, 0);
  await setBalance(tx, tenant, productD.id, warehouseAId, 24);
  await setBalance(tx, tenant, productE.id, warehouseAId, 5);
  await writePrismaProductArchive(tx, productE.id, tenant);

  const catalogue = await listSellablePosProducts(tenant, tx);
  return { ...ctx, catalogue, productA, productB, productC, productD, productE };
}

async function main() {
  const url = resolveScriptDatabaseUrl("test-write");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  const before = await goboxCounts(prisma);
  const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];

  async function isolated(name: string, run: (tx: Tx) => Promise<void>) {
    try {
      await prisma.$transaction(async (tx) => {
        await run(tx);
        throw new RollbackError();
      }, { maxWait: 20_000, timeout: 60_000 });
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

  await isolated("1. Product appears in POS catalogue", async (tx) => {
    const { catalogue, productA } = await seedCore(tx);
    assert(catalogue.some((item) => item.id === productA.id), "Product A missing from POS catalogue");
    assert(!catalogue.some((item) => item.id.startsWith("prd-")), "Mock product id leaked into catalogue");
  });

  await isolated("2. Search full name", async (tx) => {
    const { catalogue, productA } = await seedCore(tx);
    const found = filterPosCatalogue(catalogue, "EGO FIX06 Product Alpha");
    assert(found.some((item) => item.id === productA.id), "Full name search missed Product A");
  });

  await isolated("3. Search partial name", async (tx) => {
    const { catalogue, productA } = await seedCore(tx);
    const found = filterPosCatalogue(catalogue, "  alpha  ");
    assert(found.some((item) => item.id === productA.id), "Partial/case/whitespace name search missed Product A");
    assert(filterPosCatalogue(catalogue, "").length === catalogue.length, "Empty search must show catalogue");
  });

  await isolated("4. Exact SKU lookup", async (tx) => {
    const { catalogue, productA } = await seedCore(tx);
    const match = findPosScanMatch(catalogue, "e6-sku-a");
    assert(match?.product.id === productA.id, "Exact SKU lookup missed Product A");
  });

  await isolated("5. Unknown SKU", async (tx) => {
    const { catalogue } = await seedCore(tx);
    assert(findPosScanMatch(catalogue, "E6-SKU-UNKNOWN") === null, "Unknown SKU must fail safely");
  });

  await isolated("6. Exact barcode", async (tx) => {
    const { catalogue, productA } = await seedCore(tx);
    const match = findPosScanMatch(catalogue, "0011111111111");
    assert(match?.product.id === productA.id, "Exact barcode missed Product A");
  });

  await isolated("7. Barcode with leading zero", async (tx) => {
    const { catalogue, productA } = await seedCore(tx);
    const match = findPosScanMatch(catalogue, "0011111111111");
    assert(match !== null, "Leading-zero barcode did not resolve");
    assert(match.product.barcode === "0011111111111", "Leading zeros were not preserved");
    assert(match.product.id === productA.id, "Leading-zero barcode resolved wrong product");
    JSON.parse(JSON.stringify(match.product));
  });

  await isolated("8. Unknown barcode", async (tx) => {
    const { catalogue } = await seedCore(tx);
    assert(findPosScanMatch(catalogue, "0099999999999") === null, "Unknown barcode must fail safely");
  });

  await isolated("9. Product card adds cart line", async (tx) => {
    const { catalogue } = await seedCore(tx);
    const productA = requireProduct(catalogue, "E6-SKU-A");
    const result = addPosCartLine([], toLine(productA, productA.units?.[0]));
    assert(result.added && result.cart.length === 1, "Card add did not create one cart line");
    assert(result.cart[0].id === productA.id, "Wrong productId on cart line");
    assertClose(result.cart[0].priceLak, 10000, "Card add used wrong selling price");
    assert(result.cart[0].quantity === 1, "Card add quantity must be 1");
  });

  await isolated("10. Repeated scan increments qty", async (tx) => {
    const { catalogue } = await seedCore(tx);
    let cart: PosCartItem[] = [];
    cart = scanOnce(cart, catalogue, "0011111111111").cart;
    cart = scanOnce(cart, catalogue, "0011111111111").cart;
    cart = scanOnce(cart, catalogue, "0011111111111").cart;
    assert(cart.length === 1, "Repeat scan created duplicate lines");
    assert(cart[0].quantity === 3, "Repeat scan did not increment to 3");
  });

  await isolated("11. Rapid repeated scans", async (tx) => {
    const { catalogue } = await seedCore(tx);
    let cart: PosCartItem[] = [];
    for (let index = 0; index < 8; index += 1) {
      cart = scanOnce(cart, catalogue, "0011111111111").cart;
    }
    assert(cart.length === 1 && cart[0].quantity === 8, "Rapid scans dropped increments");
  });

  await isolated("12. Different barcode creates separate correct line", async (tx) => {
    const { catalogue } = await seedCore(tx);
    let cart: PosCartItem[] = [];
    cart = scanOnce(cart, catalogue, "0011111111111").cart;
    cart = scanOnce(cart, catalogue, "0022222222222").cart;
    assert(cart.length === 2, "Different barcodes must create separate lines");
    assertClose(cart.find((item) => item.sku === "E6-SKU-A")?.priceLak, 10000, "Product A price");
    assertClose(cart.find((item) => item.sku === "E6-SKU-B")?.priceLak, 5000, "Product B price");
  });

  await isolated("13. Increase qty", async (tx) => {
    const { catalogue } = await seedCore(tx);
    const productA = requireProduct(catalogue, "E6-SKU-A");
    let cart = addPosCartLine([], toLine(productA, productA.units?.[0])).cart;
    cart = updatePosCartQuantity(cart, productA.id, 4, productA.units?.[0]?.id);
    assert(cart[0].quantity === 4, "Increase qty failed");
  });

  await isolated("14. Decrease qty", async (tx) => {
    const { catalogue } = await seedCore(tx);
    const productA = requireProduct(catalogue, "E6-SKU-A");
    let cart = addPosCartLine([], toLine(productA, productA.units?.[0])).cart;
    cart = updatePosCartQuantity(cart, productA.id, 4, productA.units?.[0]?.id);
    cart = updatePosCartQuantity(cart, productA.id, 2, productA.units?.[0]?.id);
    assert(cart[0].quantity === 2, "Decrease qty failed");
  });

  await isolated("15. Remove line", async (tx) => {
    const { catalogue } = await seedCore(tx);
    const productA = requireProduct(catalogue, "E6-SKU-A");
    const productB = requireProduct(catalogue, "E6-SKU-B");
    let cart = addPosCartLine([], toLine(productA, productA.units?.[0])).cart;
    cart = addPosCartLine(cart, toLine(productB, productB.units?.[0])).cart;
    cart = removePosCartLine(cart, productA.id, productA.units?.[0]?.id);
    assert(cart.length === 1 && cart[0].sku === "E6-SKU-B", "Remove line failed");
  });

  await isolated("16. Stock limit validation", async (tx) => {
    const { catalogue } = await seedCore(tx);
    const productA = requireProduct(catalogue, "E6-SKU-A");
    assert(maxSellQty(productA.stockQty, 1) === 10, "Stock 10 must allow qty 10");
    let cart: PosCartItem[] = [];
    let last: AddPosCartResult = { added: false, capped: false, cart };
    for (let index = 0; index < 11; index += 1) {
      last = addPosCartLine(cart, toLine(productA, productA.units?.[0]));
      cart = last.cart;
    }
    assert(cart[0].quantity === 10, "Qty above stock 10 must cap");
    assert(last.added === false && last.reason === "stock_limit", "11th add must be refused by stock policy");
  });

  await isolated("17. Zero-stock behavior", async (tx) => {
    const { catalogue } = await seedCore(tx);
    const productC = requireProduct(catalogue, "E6-SKU-C");
    assertClose(productC.stockQty, 0, "Product C must have zero stock");
    const result = addPosCartLine([], toLine(productC, productC.units?.[0]));
    assert(!result.added && result.reason === "out_of_stock", "Zero-stock product must not enter cart");
    assert(result.cart.length === 0, "Zero-stock add leaked a cart line");
  });

  await isolated("18. Archived Product blocked", async (tx) => {
    const { catalogue, productE } = await seedCore(tx);
    assert(!catalogue.some((item) => item.id === productE.id), "Archived product leaked into POS catalogue");
    assert(findPosScanMatch(catalogue, "0055555555555") === null, "Archived barcode must not scan");
    assert(findPosScanMatch(catalogue, "E6-SKU-E") === null, "Archived SKU must not scan");
  });

  await isolated("19. Tenant isolation", async (tx) => {
    const storeA = await seedCore(tx);
    const storeB = await createIsolatedTenant(tx, "store-b");
    const foreign = await writePrismaProductCreate(
      tx,
      pieceInput({
        barcode: "0066666666666",
        nameEn: "EGO FIX06 Foreign Product",
        sellingPriceLak: 9000,
        sku: "E6-SKU-FOREIGN",
      }),
      storeB.tenant,
    );
    await setBalance(tx, storeB.tenant, foreign.id, storeB.warehouseAId, 8);

    const catalogueA = await listSellablePosProducts(storeA.tenant, tx);
    assert(!catalogueA.some((item) => item.id === foreign.id), "Store B product leaked into Store A POS");
    assert(findPosScanMatch(catalogueA, "0066666666666") === null, "Store A scan resolved Store B barcode");
    const lookup = await findPrismaProductByBarcode("0066666666666", storeA.tenant, tx);
    assert(lookup === null, "Server barcode lookup crossed tenants");
  });

  await isolated("20. Warehouse isolation", async (tx) => {
    const { tenant, warehouseAId, warehouseBId } = await createIsolatedTenant(tx, "wh");
    const onlyB = await writePrismaProductCreate(
      tx,
      pieceInput({
        barcode: "0077777777777",
        nameEn: "EGO FIX06 Warehouse B Only",
        sellingPriceLak: 4000,
        sku: "E6-SKU-WHB",
      }),
      tenant,
    );
    const both = await writePrismaProductCreate(
      tx,
      pieceInput({
        barcode: "0088888888888",
        nameEn: "EGO FIX06 Split Warehouse",
        sellingPriceLak: 4000,
        sku: "E6-SKU-SPLIT",
      }),
      tenant,
    );
    await setBalance(tx, tenant, onlyB.id, warehouseBId, 15);
    await setBalance(tx, tenant, both.id, warehouseAId, 3);
    await setBalance(tx, tenant, both.id, warehouseBId, 50);

    const catalogueA = await listSellablePosProducts({ ...tenant, warehouseId: warehouseAId }, tx);
    assert(!catalogueA.some((item) => item.id === onlyB.id), "WH-B-only product appeared on WH-A POS");
    const split = catalogueA.find((item) => item.id === both.id);
    assert(split, "WH-A stocked product missing from WH-A POS");
    assertClose(split.stockQty, 3, "POS stock used the wrong warehouse quantity");
  });

  await isolated("21. Package/base conversion", async (tx) => {
    const { catalogue } = await seedCore(tx);
    const productD = requireProduct(catalogue, "E6-SKU-D");
    const carton = productD.units?.find((unit) => unit.unitName === "Carton");
    assert(carton?.conversionQty === 12, "Carton conversion factor missing");
    assert(carton, "Carton unit missing");
    const match = findPosScanMatch(catalogue, "0044444444451");
    assert(match?.unit?.id === carton?.id, "Carton barcode did not select carton unit");
    let cart: PosCartItem[] = [];
    cart = addPosCartLine(cart, toLine(productD, carton)).cart;
    assert(cart[0].quantity === 1 && cart[0].unitName === "Carton", "Carton scan qty/unit incorrect");
    assertClose(cart[0].priceLak, 11000, "Carton selling price incorrect");
    assertClose(requiredBaseQty(cart[0].quantity, cart[0].conversionQty), 12, "One carton must require 12 base units");
    cart = addPosCartLine(cart, toLine(productD, carton)).cart;
    assert(cart[0].quantity === 2, "Repeat carton scan must increment carton qty");
    assertClose(requiredBaseQty(cart[0].quantity, cart[0].conversionQty), 24, "Two cartons must require 24 base units");
    const third = addPosCartLine(cart, toLine(productD, carton));
    assert(!third.added && third.cart[0].quantity === 2, "Third carton must respect 24-piece stock");
  });

  await isolated("22. Price integrity", async (tx) => {
    const { catalogue } = await seedCore(tx);
    const productA = requireProduct(catalogue, "E6-SKU-A");
    const productB = requireProduct(catalogue, "E6-SKU-B");
    assertClose(productA.priceLak, 10000, "Product A catalogue price");
    assertClose(productB.priceLak, 5000, "Product B catalogue price");
    const serialized = JSON.parse(JSON.stringify(productA));
    assertClose(serialized.priceLak, 10000, "Decimal serialization lost LAK price");
    const line = addPosCartLine([], toLine(productA, productA.units?.[0])).cart[0];
    assertClose(line.priceLak, productA.priceLak, "Cart price diverged from Product unit price");
  });

  await isolated("23. Cart subtotal", async (tx) => {
    const { catalogue } = await seedCore(tx);
    const productA = requireProduct(catalogue, "E6-SKU-A");
    const productB = requireProduct(catalogue, "E6-SKU-B");
    let cart = addPosCartLine([], toLine(productA, productA.units?.[0])).cart;
    cart = updatePosCartQuantity(cart, productA.id, 2, productA.units?.[0]?.id);
    cart = addPosCartLine(cart, toLine(productB, productB.units?.[0])).cart;
    cart = updatePosCartQuantity(cart, productB.id, 3, productB.units?.[0]?.id);
    assertClose(cartSubtotal(cart), 35000, "2x10000 + 3x5000 must be 35000");
  });

  await isolated("24. No duplicate request from Enter event", async (tx) => {
    const { catalogue } = await seedCore(tx);
    const query = "0011111111111";
    const filtered = filterPosCatalogue(catalogue, query);
    assert(filtered.length >= 1, "Typing/scanning into search must still filter");
    let cart: PosCartItem[] = [];
    const enter = scanOnce(cart, catalogue, query);
    cart = enter.cart;
    assert(enter.found && enter.added && cart[0].quantity === 1, "Enter scan must add once");
    const nameEnter = scanOnce(cart, catalogue, "EGO FIX06 Product Alpha");
    assert(!nameEnter.found, "Product-name Enter must not be treated as barcode");
    assert(nameEnter.cart[0].quantity === 1, "Name Enter must not add a second qty");
  });

  const after = await goboxCounts(prisma);
  const leaked = await prisma.company.count({
    where: { storeCode: { startsWith: "e6" }, NOT: { id: before.companyId } },
  });
  await prisma.$disconnect();

  assert(leaked === 0, `Isolated fixtures leaked ${leaked} companies`);
  assert(after.products === before.products, "GO BOX product count changed");
  assert(after.balances === before.balances, "GO BOX balance count changed");
  assert(after.lots === before.lots, "GO BOX lot count changed");
  assert(after.movements === before.movements, "GO BOX movement count changed");
  assert(after.sales === before.sales, "GO BOX sale count changed");

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
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
