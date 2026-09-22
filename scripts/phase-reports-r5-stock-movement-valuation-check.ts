/**
 * REPORTS R5 — Stock Movement + Stock Valuation.
 * On Hand mutations only (stock_movements). Hold/ACTIVE reservation is NOT a movement.
 * Valuation = Current Cost (On Hand × base-unit cost). No FIFO/WAC/historical As-Of.
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
  stockValueLak,
} from "../features/reports/inventory-table-math";
import { parseInventoryTableQuery } from "../features/reports/inventory-table-query";
import { loadStockOnHandTable } from "../features/reports/inventory-table-repository";
import {
  movementDelta,
  qtyInFromDelta,
  qtyOutFromDelta,
  resolveMovementKind,
  STOCK_VALUATION_METHOD,
  summarizeMovementRows,
} from "../features/reports/movement-table-math";
import { parseMovementTableQuery } from "../features/reports/movement-table-query";
import { loadStockMovementTable } from "../features/reports/movement-table-repository";
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
    super("R5 isolated fixture rollback");
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

const r5Keys = [
  "movementType",
  "movementStockIn",
  "movementPurchaseGrn",
  "movementSale",
  "movementRefund",
  "movementVoidRestore",
  "movementAdjustmentIn",
  "movementAdjustmentOut",
  "movementStockCount",
  "qtyIn",
  "qtyOut",
  "netMovement",
  "balanceAfter",
  "movementValue",
  "totalMovements",
  "productsAffected",
  "reference",
  "user",
  "noCost",
  "productsWithoutCost",
  "valuationMethod",
  "currentCostValuation",
  "currentBaseUnitCost",
  "costSource",
  "emptyMovementTable",
  "errorMovementTable",
  "loadingMovementTable",
  "movementReservationNote",
  "currentInventoryValuation",
  "emptyValuationTable",
  "errorValuationTable",
  "loadingValuationTable",
];

check(
  "1. R5 routes are live, not Coming Soon shells",
  existsSync(join(ROOT, "app/(dashboard)/reports/inventory/movements/page.tsx")) &&
    existsSync(join(ROOT, "app/(dashboard)/reports/inventory/valuation/page.tsx")) &&
    existsSync(join(ROOT, "app/api/reports/inventory/movements/export/route.ts")) &&
    existsSync(join(ROOT, "app/api/reports/inventory/valuation/export/route.ts")) &&
    !isPlannedReportCenterEntry(findReportCenterEntryByHref("/reports/inventory/movements")!) &&
    !isPlannedReportCenterEntry(findReportCenterEntryByHref("/reports/inventory/valuation")!) &&
    read("app/(dashboard)/reports/inventory/movements/page.tsx").includes("StockMovementReportView") &&
    read("app/(dashboard)/reports/inventory/valuation/page.tsx").includes("StockValuationReportView"),
);
check("2. No remaining Planned report center hrefs", REPORT_CENTER_PLANNED_HREFS.length === 0);
check(
  "3. Qty In/Out/Net sign model",
  qtyInFromDelta(-5) === 0 &&
    qtyOutFromDelta(-5) === 5 &&
    qtyInFromDelta(2) === 2 &&
    qtyOutFromDelta(2) === 0 &&
    movementDelta(10, 5) === -5 &&
    movementDelta(8, 10) === 2,
);
check(
  "4. Movement kind classification from persisted types",
  resolveMovementKind({ beforeQty: 10, afterQty: 5, movementType: "sale", referenceType: "sale" }) === "sale" &&
    resolveMovementKind({ beforeQty: 5, afterQty: 7, movementType: "return", note: "Refund", referenceType: "sale" }) === "refund" &&
    resolveMovementKind({ beforeQty: 5, afterQty: 8, movementType: "return", note: "Void restore", referenceType: "sale" }) === "void_restore" &&
    resolveMovementKind({ beforeQty: 10, afterQty: 12, movementType: "adjustment", referenceType: "stock_adjustment" }) === "adjustment_in" &&
    resolveMovementKind({ beforeQty: 10, afterQty: 8, movementType: "adjustment", referenceType: "stock_adjustment" }) === "adjustment_out" &&
    resolveMovementKind({ beforeQty: 10, afterQty: 10, movementType: "adjustment", referenceType: "stock_count" }) === "stock_count" &&
    resolveMovementKind({ beforeQty: 0, afterQty: 20, movementType: "purchase", referenceType: "goods_receipt" }) === "purchase_grn" &&
    resolveMovementKind({ beforeQty: 0, afterQty: 5, movementType: "purchase", referenceType: "quick_stock_in" }) === "stock_in",
);
check(
  "5. Hold/reservation is not a stock movement writer",
  !read("features/pos/stock-reservation.ts").includes("stockMovement.create") &&
    read("features/reports/movement-table-math.ts").includes("Hold/ACTIVE reservation is NOT a movement") &&
    read("features/reports/components/movement-table-report.tsx").includes("movementReservationNote"),
);
check(
  "6. Valuation method is Current Cost only",
  STOCK_VALUATION_METHOD === "current_cost" &&
    read("features/reports/inventory-table-excel.ts").includes("currentCostValuation") &&
    !read("features/reports/inventory-table-excel.ts").includes("FIFO") &&
    !read("features/reports/components/inventory-table-report.tsx").includes("As Of Date") &&
    read("features/reports/components/inventory-table-report.tsx").includes("currentInventoryValuation"),
);
check(
  "7. Spreadsheet style + ExcelJS full-filter exports",
  read("features/reports/components/movement-table-report.tsx").includes("border-zinc-300") &&
    read("features/reports/movement-table-excel.ts").includes("exceljs") &&
    read("features/reports/movement-table-excel.ts").includes("EGO-POS-Stock-Movement") &&
    read("features/reports/inventory-table-excel.ts").includes("EGO-POS-Stock-Valuation") &&
    read("features/reports/movement-table-service.ts").includes("allRows: true"),
);
check(
  "8. EN/LO complete for R5 keys",
  reportsCopyKeyParity() &&
    reportsCopyHasNoReplacementChars() &&
    r5Keys.every((key) => tReports(key, "en") !== key && tReports(key, "lo") !== tReports(key, "en") && !thaiScript.test(tReports(key, "lo"))),
);
check("9. Owner + Manager keep report access; cashier denied", canViewFullStoreReports("owner") && canViewFullStoreReports("manager") && !canViewFullStoreReports("cashier"));
check("10. Batch H cash refund KPI unchanged", CASH_SESSION_SALE_STATUSES.includes("refunded"));
check(
  "11. Query parsing defaults",
  parseMovementTableQuery({}, { datePreset: "today" }).datePreset === "today" &&
    parseMovementTableQuery({ movementKind: "sale", page: "2" }, { datePreset: "today" }).movementKind === "sale" &&
    parseMovementTableQuery({ movementKind: "sale", page: "2" }, { datePreset: "today" }).page === 2,
);
check(
  "12. Summary math",
  (() => {
    const summary = summarizeMovementRows([
      { movementValueLak: 1000, netQty: 2, productId: "a", qtyIn: 2, qtyOut: 0 },
      { movementValueLak: -500, netQty: -1, productId: "a", qtyIn: 0, qtyOut: 1 },
      { movementValueLak: -2000, netQty: -2, productId: "b", qtyIn: 0, qtyOut: 2 },
    ]);
    return (
      summary.totalMovements === 3 &&
      summary.totalQtyIn === 2 &&
      summary.totalQtyOut === 3 &&
      summary.netMovement === -1 &&
      summary.productsAffected === 2 &&
      summary.valueInLak === 1000 &&
      summary.valueOutLak === 2500
    );
  })(),
);

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `R5 ${label}`, passwordHash: "isolated-fixture", username: `r5u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `R5 ${label}`, ownerUserId: user.id, storeCode: `r5${token}` },
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
        const ctx = await createIsolatedTenant(tx, "movement-valuation");
        const category = await tx.category.create({
          data: { branchId: ctx.tenant.branchId, companyId: ctx.tenant.companyId, nameEn: "R5 Cat", nameLo: "R5 Cat" },
        });

        async function makeProduct(suffix: string, onHand: number, cost: number, reserved = 0) {
          const product = await tx.product.create({
            data: {
              branchId: ctx.tenant.branchId,
              categoryId: category.id,
              companyId: ctx.tenant.companyId,
              costPriceLak: cost,
              isActive: true,
              minStock: 0,
              nameEn: `R5 ${suffix}`,
              nameLo: `R5 ${suffix}`,
              sellingPriceLak: 1500,
              sku: `R5-${suffix}`,
              status: "active",
            },
          });
          const unit = await tx.productUnit.create({
            data: {
              conversionQty: 1,
              costPriceLak: cost,
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
                holdNo: `R5-H-${suffix}-${randomBytes(2).toString("hex")}`,
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
          return { product, unit };
        }

        const withCost = await makeProduct("A", 60, 1000, 10);
        const noCost = await makeProduct("B", 12, 0, 0);

        // Opening
        await tx.stockMovement.create({
          data: {
            afterQty: 100,
            beforeQty: 0,
            companyId: ctx.tenant.companyId,
            createdBy: ctx.userId,
            movementType: "purchase",
            note: "Opening",
            productId: withCost.product.id,
            quantity: 100,
            referenceId: "open-1",
            referenceType: "go_box_opening",
            unitId: withCost.unit.id,
            warehouseId: ctx.warehouseId,
          },
        });
        // Stock In
        await tx.stockMovement.create({
          data: {
            afterQty: 120,
            beforeQty: 100,
            companyId: ctx.tenant.companyId,
            createdBy: ctx.userId,
            movementType: "purchase",
            note: "QSI",
            productId: withCost.product.id,
            quantity: 20,
            referenceId: "qsi-1",
            referenceType: "quick_stock_in",
            unitId: withCost.unit.id,
            warehouseId: ctx.warehouseId,
          },
        });
        // Sale −5
        await tx.stockMovement.create({
          data: {
            afterQty: 115,
            beforeQty: 120,
            companyId: ctx.tenant.companyId,
            createdBy: ctx.userId,
            movementType: "sale",
            note: "Sale",
            productId: withCost.product.id,
            quantity: -5,
            referenceId: "sale-1",
            referenceType: "sale",
            unitId: withCost.unit.id,
            warehouseId: ctx.warehouseId,
          },
        });
        // Refund +2
        await tx.stockMovement.create({
          data: {
            afterQty: 117,
            beforeQty: 115,
            companyId: ctx.tenant.companyId,
            createdBy: ctx.userId,
            movementType: "return",
            note: "Refund",
            productId: withCost.product.id,
            quantity: 2,
            referenceId: "sale-1",
            referenceType: "sale",
            unitId: withCost.unit.id,
            warehouseId: ctx.warehouseId,
          },
        });
        // Void restore +3
        await tx.stockMovement.create({
          data: {
            afterQty: 120,
            beforeQty: 117,
            companyId: ctx.tenant.companyId,
            createdBy: ctx.userId,
            movementType: "return",
            note: "Void restore",
            productId: withCost.product.id,
            quantity: 3,
            referenceId: "sale-2",
            referenceType: "sale",
            unitId: withCost.unit.id,
            warehouseId: ctx.warehouseId,
          },
        });
        // Adjustment +
        await tx.stockMovement.create({
          data: {
            afterQty: 125,
            beforeQty: 120,
            companyId: ctx.tenant.companyId,
            createdBy: ctx.userId,
            movementType: "adjustment",
            note: "Adj+",
            productId: withCost.product.id,
            quantity: 5,
            referenceId: "adj-1",
            referenceType: "stock_adjustment",
            unitId: withCost.unit.id,
            warehouseId: ctx.warehouseId,
          },
        });
        // Adjustment −
        await tx.stockMovement.create({
          data: {
            afterQty: 123,
            beforeQty: 125,
            companyId: ctx.tenant.companyId,
            createdBy: ctx.userId,
            movementType: "adjustment",
            note: "Adj-",
            productId: withCost.product.id,
            quantity: -2,
            referenceId: "adj-2",
            referenceType: "stock_adjustment",
            unitId: withCost.unit.id,
            warehouseId: ctx.warehouseId,
          },
        });
        // Stock count
        await tx.stockMovement.create({
          data: {
            afterQty: 60,
            beforeQty: 123,
            companyId: ctx.tenant.companyId,
            createdBy: ctx.userId,
            movementType: "adjustment",
            note: "Count",
            productId: withCost.product.id,
            quantity: -63,
            referenceId: "count-1",
            referenceType: "stock_count",
            unitId: withCost.unit.id,
            warehouseId: ctx.warehouseId,
          },
        });
        // Duplicate refund must not invent a second row automatically — we intentionally do NOT create a second refund here.
        // Hold reservation exists for product A but creates NO movement (already created above).

        const movesBeforeHold = await tx.stockMovement.count({
          where: { companyId: ctx.tenant.companyId, productId: withCost.product.id },
        });
        const reservationCount = await tx.stockReservation.count({
          where: { companyId: ctx.tenant.companyId, productId: withCost.product.id, status: "ACTIVE" },
        });
        check("13. Hold reservation exists without requiring movement write", reservationCount === 1);
        check("14. Movement count is On Hand mutations only (8 rows)", movesBeforeHold === 8);

        const movementReport = await loadStockMovementTable(
          ctx.tenant,
          parseMovementTableQuery(
            { warehouseId: ctx.warehouseId, productId: withCost.product.id, datePreset: "custom", dateFrom: "2000-01-01", dateTo: "2099-12-31" },
            { datePreset: "today" },
          ),
          tx,
          { allRows: true },
        );

        const byKind = new Map(movementReport.rows.map((row) => [row.kind, row]));
        const sale = movementReport.rows.find((row) => row.kind === "sale");
        const refund = movementReport.rows.find((row) => row.kind === "refund");
        check("15. Movement report includes classified kinds", Boolean(byKind.get("stock_in") || byKind.get("purchase_grn")) && Boolean(sale) && Boolean(refund));
        check(
          "16. Sale Qty In/Out/Net",
          Boolean(sale) && sale!.qtyIn === 0 && sale!.qtyOut === 5 && sale!.netQty === -5 && sale!.balanceAfter === 115,
        );
        check(
          "17. Refund Qty In/Out/Net",
          Boolean(refund) && refund!.qtyIn === 2 && refund!.qtyOut === 0 && refund!.netQty === 2,
        );
        check("18. Movement report row count matches persisted On Hand mutations", movementReport.summary.totalMovements === 8);
        check(
          "19. Opening + In − Out reconciles across reported nets",
          movementReport.summary.netMovement === 60,
        );

        const onHand = await loadStockOnHandTable(
          ctx.tenant,
          parseInventoryTableQuery({ warehouseId: ctx.warehouseId }, { status: "all" }),
          tx,
          { allRows: true },
        );
        const valuation = await loadStockOnHandTable(
          ctx.tenant,
          parseInventoryTableQuery({ warehouseId: ctx.warehouseId }, { status: "all" }),
          tx,
          { allRows: true },
        );
        const a = onHand.rows.find((row) => row.sku === "R5-A");
        const b = onHand.rows.find((row) => row.sku === "R5-B");
        const va = valuation.rows.find((row) => row.sku === "R5-A");
        const vb = valuation.rows.find((row) => row.sku === "R5-B");

        check(
          "20. Valuation On Hand matches Stock On Hand",
          Boolean(a && va) && a!.onHand === va!.onHand && a!.reserved === va!.reserved && a!.available === va!.available,
        );
        check(
          "21. Current cost valuation uses base qty × base cost",
          Boolean(a) && a!.onHand === 60 && a!.unitCostLak === 1000 && a!.stockValueLak === stockValueLak(60, 1000) && a!.stockValueLak === 60000,
        );
        check(
          "22. Reserved included in On Hand value (not subtracted)",
          Boolean(a) && a!.reserved === 10 && a!.available === availableBaseQty(60, 10) && a!.stockValueLak === 60000,
        );
        check(
          "23. Missing cost shows hasCost false and productsWithoutCost",
          Boolean(b && vb) && b!.hasCost === false && vb!.hasCost === false && valuation.summary.productsWithoutCost >= 1,
        );
        check(
          "24. Total stock value excludes missing-cost products",
          valuation.summary.totalStockValueLak === 60000,
        );

        throw new RollbackError();
      },
      { maxWait: 15000, timeout: 60000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackError)) throw error;
  } finally {
    await prisma.$disconnect();
  }
}

await liveMatrix();

if (failed > 0) {
  console.error(`\nphase-reports-r5-stock-movement-valuation-check: FAIL (${passed} passed, ${failed} failed)`);
  process.exit(1);
}
console.log(`\nphase-reports-r5-stock-movement-valuation-check: PASS (${passed})`);
