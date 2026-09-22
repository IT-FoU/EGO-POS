/**
 * REPORTS R4 — Inventory reports.
 * Stock On Hand + Low Stock / Reorder.
 * Uses Available = On Hand − ACTIVE Reserved. Does not invent reorder qty.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { canViewFullStoreReports } from "../features/permissions/store-ui-permissions";
import { CASH_SESSION_SALE_STATUSES } from "../features/pos/post-sale-shared";
import {
  availableBaseQty,
  classifyInventoryStock,
  hasReorderThreshold,
  stockValueLak,
} from "../features/reports/inventory-table-math";
import { parseInventoryTableQuery } from "../features/reports/inventory-table-query";
import { loadLowStockTable, loadStockOnHandTable } from "../features/reports/inventory-table-repository";
import { REPORT_CENTER_PLANNED_HREFS, findReportCenterEntryByHref, isPlannedReportCenterEntry } from "../features/reports/report-center-catalog";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const ROOT = process.cwd();
const thaiScript = /[\u0E00-\u0E7F]/;

class RollbackError extends Error {
  constructor() {
    super("R4 isolated fixture rollback");
    this.name = "RollbackError";
  }
}

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, extra = "") {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}${extra ? ` — ${extra}` : ""}`);
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

const r4Keys = [
  "colOnHand",
  "colReserved",
  "colAvailable",
  "colReorderLevel",
  "colBaseUnit",
  "colLastMovement",
  "colLastReceived",
  "stockStatus",
  "statusInStock",
  "statusLowStock",
  "statusOutOfStock",
  "statusReserved",
  "noReorderLevel",
  "unitCost",
  "totalProducts",
  "suggestedReorder",
  "alreadyOrdered",
  "reorderNeeded",
  "yes",
  "no",
  "emptyInventoryTable",
  "errorInventoryTable",
  "loadingInventoryTable",
  "openProductStock",
  "backToStockOnHand",
  "selectedInventoryProduct",
  "inventoryUnitNote",
  "reservedBadge",
];

check(
  "1. R4 routes are live, not Planned shells",
  existsSync(join(ROOT, "app/(dashboard)/reports/inventory/on-hand/page.tsx")) &&
    existsSync(join(ROOT, "app/(dashboard)/reports/inventory/low-stock/page.tsx")) &&
    existsSync(join(ROOT, "app/api/reports/inventory/on-hand/export/route.ts")) &&
    existsSync(join(ROOT, "app/api/reports/inventory/low-stock/export/route.ts")) &&
    !isPlannedReportCenterEntry(findReportCenterEntryByHref("/reports/inventory/on-hand")!) &&
    !isPlannedReportCenterEntry(findReportCenterEntryByHref("/reports/inventory/low-stock")!),
);
check("2. No remaining Planned report center hrefs", REPORT_CENTER_PLANNED_HREFS.length === 0);
check(
  "3. Shared math: Available and classification",
  availableBaseQty(20, 5) === 15 &&
    classifyInventoryStock({ available: 0, minStock: 10 }) === "out_of_stock" &&
    classifyInventoryStock({ available: 10, minStock: 10 }) === "low_stock" &&
    classifyInventoryStock({ available: 11, minStock: 10 }) === "in_stock" &&
    classifyInventoryStock({ available: 5, minStock: 0 }) === "no_reorder_level" &&
    !hasReorderThreshold(0) &&
    stockValueLak(4, 2500) === 10000,
);
check(
  "4. Hold/reservation semantics remain Available-aware",
  read("features/pos/stock-reservation.ts").includes("availableBaseQty") &&
    read("features/reports/inventory-table-math.ts").includes("Available") &&
    read("features/reports/inventory-table-repository.ts").includes('status: "ACTIVE"'),
);
check(
  "5. Spreadsheet style + ExcelJS full-filter exports",
  read("features/reports/components/inventory-table-report.tsx").includes("border-zinc-300") &&
    read("features/reports/inventory-table-excel.ts").includes("exceljs") &&
    read("features/reports/inventory-table-service.ts").includes("allRows: true") &&
    !read("features/reports/components/inventory-table-report.tsx").includes('t("print"'),
);
check(
  "6. No invented reorder quantity column",
  !read("features/reports/components/inventory-table-report.tsx").includes("Suggested Reorder Qty") &&
    read("features/reports/components/inventory-table-report.tsx").includes("reorderNeeded") &&
    read("features/reports/inventory-table-math.ts").includes("do not invent"),
);
check(
  "7. EN/LO complete for R4 keys",
  reportsCopyKeyParity() &&
    reportsCopyHasNoReplacementChars() &&
    r4Keys.every((key) => tReports(key, "en") !== key && tReports(key, "lo") !== tReports(key, "en") && !thaiScript.test(tReports(key, "lo"))),
);
check("8. Owner + Manager keep report access; cashier denied", canViewFullStoreReports("owner") && canViewFullStoreReports("manager") && !canViewFullStoreReports("cashier"));
check("9. Batch H cash refund KPI unchanged", CASH_SESSION_SALE_STATUSES.includes("refunded"));
check(
  "10. Query parsing defaults",
  parseInventoryTableQuery({ status: "low_stock", page: "2" }, { status: "all" }).status === "low_stock" &&
    parseInventoryTableQuery({}, { status: "all" }).page === 1,
);

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `R4 ${label}`, passwordHash: "isolated-fixture", username: `r4u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `R4 ${label}`, ownerUserId: user.id, storeCode: `r4${token}` },
  });
  const branch = await tx.branch.create({
    data: { companyId: company.id, isMainBranch: true, name: "Main" },
  });
  const warehouse = await tx.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH-A", type: "store" },
  });
  await tx.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: true, status: "active", userId: user.id },
  });
  const tenant: TenantContext = {
    branchId: branch.id,
    companyId: company.id,
    userId: user.id,
    warehouseId: warehouse.id,
  };
  return { tenant, userId: user.id, warehouseId: warehouse.id };
}

async function liveMatrix() {
  const url = resolveScriptDatabaseUrl("test-write");
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.$transaction(
      async (tx) => {
        const ctx = await createIsolatedTenant(tx, "inventory-reports");
        const category = await tx.category.create({
          data: { branchId: ctx.tenant.branchId, companyId: ctx.tenant.companyId, nameEn: "R4 Cat", nameLo: "R4 Cat" },
        });

        async function makeProduct(suffix: string, minStock: number, onHand: number, reserved = 0) {
          const product = await tx.product.create({
            data: {
              branchId: ctx.tenant.branchId,
              categoryId: category.id,
              companyId: ctx.tenant.companyId,
              costPriceLak: 1000,
              isActive: true,
              minStock,
              nameEn: `R4 ${suffix}`,
              nameLo: `R4 ${suffix}`,
              sellingPriceLak: 1500,
              sku: `R4-${suffix}`,
              status: "active",
            },
          });
          const unit = await tx.productUnit.create({
            data: {
              conversionQty: 1,
              costPriceLak: 1000,
              isBaseUnit: true,
              isDefaultSaleUnit: true,
              isPurchaseUnit: true,
              productId: product.id,
              sellingPriceLak: 1500,
              unitName: "Piece",
            },
          });
          await tx.inventoryBalance.create({
            data: {
              companyId: ctx.tenant.companyId,
              productId: product.id,
              quantity: onHand,
              warehouseId: ctx.warehouseId,
            },
          });
          if (reserved > 0) {
            const hold = await tx.holdBill.create({
              data: {
                branchId: ctx.tenant.branchId,
                cashierId: ctx.userId,
                companyId: ctx.tenant.companyId,
                holdNo: `R4-H-${suffix}-${randomBytes(2).toString("hex")}`,
                status: "held",
                warehouseId: ctx.warehouseId,
              },
            });
            const holdItem = await tx.holdBillItem.create({
              data: {
                holdBillId: hold.id,
                lineTotal: reserved * 1500,
                productId: product.id,
                productUnitId: unit.id,
                quantity: reserved,
                sellingPrice: 1500,
                unitPrice: 1500,
              },
            });
            await tx.stockReservation.create({
              data: {
                baseQuantity: reserved,
                branchId: ctx.tenant.branchId!,
                companyId: ctx.tenant.companyId,
                holdBillId: hold.id,
                holdBillItemId: holdItem.id,
                productId: product.id,
                productUnitId: unit.id,
                status: "ACTIVE",
                warehouseId: ctx.warehouseId,
              },
            });
          }
          return product;
        }

        await makeProduct("A", 10, 20, 5);
        await makeProduct("B", 10, 10, 0);
        await makeProduct("C", 10, 0, 0);
        await makeProduct("D", 0, 8, 0);
        await makeProduct("E", 10, 12, 3);

        const onHand = await loadStockOnHandTable(
          ctx.tenant,
          parseInventoryTableQuery({ warehouseId: ctx.warehouseId }, { status: "all" }),
          tx,
          { allRows: true },
        );
        const bySku = new Map(onHand.rows.map((row) => [row.sku, row]));
        const a = bySku.get("R4-A");
        const b = bySku.get("R4-B");
        const c = bySku.get("R4-C");
        const d = bySku.get("R4-D");
        const e = bySku.get("R4-E");

        check("11. On Hand / Reserved / Available for reserved product", Boolean(a) && a!.onHand === 20 && a!.reserved === 5 && a!.available === 15);
        check("12. Low stock uses Available threshold", Boolean(b) && b!.status === "low_stock");
        check("13. Out of stock", Boolean(c) && c!.status === "out_of_stock");
        check("14. No reorder level when minStock is 0", Boolean(d) && d!.status === "no_reorder_level");
        check("15. Reservation can force low stock", Boolean(e) && e!.available === 9 && e!.status === "low_stock");
        check("16. Stock value uses current base cost", Boolean(a) && a!.stockValueLak === 20000 && a!.unitCostLak === 1000);

        const low = await loadLowStockTable(
          ctx.tenant,
          parseInventoryTableQuery({ warehouseId: ctx.warehouseId }, { status: "all" }),
          tx,
          { allRows: true },
        );
        const lowSkus = new Set(low.rows.map((row) => row.sku));
        check(
          "17. Low stock report includes B/C/E and excludes in-stock A",
          lowSkus.has("R4-B") && lowSkus.has("R4-C") && lowSkus.has("R4-E") && !lowSkus.has("R4-A"),
        );
        check("18. Summary Available totals", onHand.summary.totalAvailable === 15 + 10 + 0 + 8 + 9);

        throw new RollbackError();
      },
      { maxWait: 20_000, timeout: 180_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackError)) throw error;
  } finally {
    await prisma.$disconnect();
  }
}

await liveMatrix();

if (failed) {
  console.error(`\nphase-reports-r4-inventory-reports-check: FAIL (${passed} passed, ${failed} failed)`);
  process.exit(1);
}
console.log(`\nphase-reports-r4-inventory-reports-check: PASS (${passed})`);
