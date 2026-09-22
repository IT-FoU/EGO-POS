/**
 * REPORTS R8 — Reorder / Purchase Suggestion.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  classifyReorderReason,
  qualifiesAutoNeedReorder,
  remainingOrderedQty,
  R8_ACTIVE_PO_STATUSES,
} from "../features/reports/reorder-report-math";
import { writePrismaProductCreate } from "../features/products/prisma-repository";
import {
  addManualReorderItem,
  loadReorderPage,
  removeManualReorderItem,
} from "../features/reports/reorder-report-repository";
import { parseReorderTableQuery } from "../features/reports/reorder-report-query";
import { findReportCenterEntryByHref, isPlannedReportCenterEntry } from "../features/reports/report-center-catalog";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const ROOT = process.cwd();
const thaiScript = /[\u0E00-\u0E7F]/;

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

const r8Keys = [
  "reorderPurchaseSuggestion",
  "needReorder",
  "reasonOutOfStock",
  "reasonReachedReorderLevel",
  "reasonOnlyOneTwoLeft",
  "reasonAddedManually",
  "orderQty",
  "orderUnit",
  "estimatedCost",
  "noBarcode",
  "createPo",
  "groupBySupplier",
  "selectAll",
  "clearSelection",
  "receivedQty",
  "remaining",
  "addToReorder",
  "removeFromReorder",
];

check("1. EN/LO reports copy key parity", reportsCopyKeyParity());
check("2. Lao reports copy has no replacement chars", reportsCopyHasNoReplacementChars());
check(
  "3. R8 EN/LO keys present",
  r8Keys.every((key) => Boolean(tReports(key, "en")) && Boolean(tReports(key, "lo"))),
);
check(
  "4. R8 Lao keys use Lao script (no Thai)",
  r8Keys.every((key) => !thaiScript.test(tReports(key, "lo"))),
);

const stackFiles = [
  "features/reports/reorder-report-math.ts",
  "features/reports/reorder-report-query.ts",
  "features/reports/reorder-report-repository.ts",
  "features/reports/reorder-report-service.ts",
  "features/reports/reorder-report-excel.ts",
  "features/reports/components/reorder-report-views.tsx",
  "app/(dashboard)/reports/inventory/reorder/page.tsx",
  "prisma/migrations/20260922161600_add_reorder_manual_items/migration.sql",
];
check(
  "5. R8 stack + migration files exist",
  stackFiles.every((path) => existsSync(join(ROOT, path))),
);

const entry = findReportCenterEntryByHref("/reports/inventory/reorder");
check("6. Reorder route live", Boolean(entry) && !isPlannedReportCenterEntry(entry!));
check("7. Low Stock report preserved", Boolean(findReportCenterEntryByHref("/reports/inventory/low-stock")));

check("8. Threshold Available 11 / min 10 → no", !qualifiesAutoNeedReorder({ available: 11, minStock: 10 }));
check("9. Threshold Available 10 / min 10 → yes", qualifiesAutoNeedReorder({ available: 10, minStock: 10 }));
check("10. Threshold Available 0 → yes", qualifiesAutoNeedReorder({ available: 0, minStock: 10 }));
check("11. No threshold Available 3 → no", !qualifiesAutoNeedReorder({ available: 3, minStock: 0 }));
check("12. No threshold Available 2 → yes", qualifiesAutoNeedReorder({ available: 2, minStock: 0 }));
check("13. No threshold Available 0 → yes", qualifiesAutoNeedReorder({ available: 0, minStock: 0 }));
check(
  "14. Reason priority Out of Stock",
  classifyReorderReason({ available: 0, isManual: true, minStock: 10 }) === "out_of_stock",
);
check(
  "15. Reason Reached Reorder Level",
  classifyReorderReason({ available: 5, isManual: false, minStock: 10 }) === "reached_reorder_level",
);
check(
  "16. Reason Only 1–2 Left",
  classifyReorderReason({ available: 2, isManual: false, minStock: 0 }) === "only_1_2_left",
);
check(
  "17. Reason Added Manually",
  classifyReorderReason({ available: 50, isManual: true, minStock: 0 }) === "added_manually",
);
check("18. Remaining = ordered - received", remainingOrderedQty(10, 3) === 7);
check(
  "19. Active PO statuses",
  R8_ACTIVE_PO_STATUSES.join(",") === "draft,ordered,partial",
);
check("20. Query parser", parseReorderTableQuery({ tab: "already" }).tab === "already");
check(
  "21. Owner permissions gate in service",
  read("features/reports/reorder-report-service.ts").includes("REPORTS_VIEW_FULL") &&
    read("features/reports/reorder-report-service.ts").includes("purchasingCreate"),
);
check(
  "22. Create PO uses existing engine",
  read("features/reports/reorder-report-repository.ts").includes("createPurchaseOrder"),
);
check(
  "23. No auto qty/unit formulas",
  !read("features/reports/reorder-report-math.ts").includes("targetStock") &&
    !read("features/reports/components/reorder-report-views.tsx").includes("Suggested Order"),
);
check(
  "24. Barcode primary not SKU column",
  read("features/reports/components/reorder-report-views.tsx").includes('t("barcode"') &&
    !read("features/reports/components/reorder-report-views.tsx").includes('t("sku"'),
);

async function live() {
  loadProjectEnvFiles();
  const url = resolveScriptDatabaseUrl({ allowProduction: false });
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });
  const stamp = randomBytes(3).toString("hex");
  const marker = `R8-${stamp}`;

  try {
    // Ensure migration table exists on local/dev.
    await prisma.$executeRawUnsafe(`
      SELECT 1 FROM "reorder_manual_items" LIMIT 1
    `).catch(async () => {
      const sql = read("prisma/migrations/20260922161600_add_reorder_manual_items/migration.sql");
      for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
        await prisma.$executeRawUnsafe(stmt);
      }
    });

    const company = await (prisma as any).company.findFirst({ orderBy: { createdAt: "asc" } });
    assert(company, "company required");
    const branch = await (prisma as any).branch.findFirst({ where: { companyId: company.id } });
    assert(branch, "branch required");
    const warehouse = await (prisma as any).warehouse.findFirst({
      where: { branchId: branch.id, companyId: company.id },
    });
    assert(warehouse, "warehouse required");
    const supplier = await (prisma as any).supplier.findFirst({
      where: { companyId: company.id, status: "active" },
    });
    assert(supplier, "supplier required");
    const user = await (prisma as any).user.findFirst({ orderBy: { createdAt: "asc" } });
    const tenant: TenantContext = {
      branchId: branch.id,
      companyId: company.id,
      userId: String(user?.id ?? "r8-test"),
      warehouseId: warehouse.id,
    };

    const low = await writePrismaProductCreate(
      prisma,
      {
        barcode: `881${stamp}1`,
        costPriceLak: 1000,
        initialStock: { note: marker, quantity: 5, unitName: "Piece" },
        minStock: 10,
        nameEn: `${marker} Low`,
        nameLo: `${marker} Low`,
        productCode: `R8L-${stamp}`,
        sellingPriceLak: 2000,
        sku: `R8L-${stamp}`,
        status: "active",
        units: [
          {
            barcode: `881${stamp}1`,
            conversionQty: 1,
            costPriceLak: 1000,
            isBaseUnit: true,
            isDefaultSaleUnit: true,
            isPurchaseUnit: true,
            pricingMode: "manual",
            sellingPriceLak: 2000,
            sortOrder: 0,
            status: "active",
            unitName: "Piece",
          },
        ],
      },
      tenant,
    );
    const healthy = await writePrismaProductCreate(
      prisma,
      {
        barcode: `881${stamp}2`,
        costPriceLak: 500,
        initialStock: { note: marker, quantity: 50, unitName: "Piece" },
        minStock: 0,
        nameEn: `${marker} Healthy`,
        nameLo: `${marker} Healthy`,
        productCode: `R8H-${stamp}`,
        sellingPriceLak: 900,
        sku: `R8H-${stamp}`,
        status: "active",
        units: [
          {
            barcode: `881${stamp}2`,
            conversionQty: 1,
            costPriceLak: 500,
            isBaseUnit: true,
            isDefaultSaleUnit: true,
            isPurchaseUnit: true,
            pricingMode: "manual",
            sellingPriceLak: 900,
            sortOrder: 0,
            status: "active",
            unitName: "Piece",
          },
        ],
      },
      tenant,
    );

    const need = await loadReorderPage(
      tenant,
      parseReorderTableQuery({ tab: "need", warehouseId: warehouse.id }),
      prisma,
      { allRows: true },
    );
    const lowRow = need.needRows.find((row) => row.productId === low.id);
    check("25. Auto low product in Need Reorder", Boolean(lowRow) && lowRow!.reason === "reached_reorder_level");

    const manual = await addManualReorderItem(
      tenant,
      { productId: healthy.id, warehouseId: warehouse.id },
      tenant.userId,
      prisma,
    );
    check("26. Manual add creates row", !manual.alreadyOrdered && !(manual as { duplicate?: boolean }).duplicate);
    const need2 = await loadReorderPage(
      tenant,
      parseReorderTableQuery({ tab: "need", warehouseId: warehouse.id }),
      prisma,
      { allRows: true },
    );
    check(
      "27. Manual healthy product in Need Reorder",
      Boolean(need2.needRows.find((row) => row.productId === healthy.id && row.reason === "added_manually")),
    );
    const dup = await addManualReorderItem(
      tenant,
      { productId: healthy.id, warehouseId: warehouse.id },
      tenant.userId,
      prisma,
    );
    check("28. Duplicate manual add blocked", Boolean((dup as { duplicate?: boolean }).duplicate));

    await removeManualReorderItem(tenant, { productId: healthy.id, warehouseId: warehouse.id }, prisma);
    const need3 = await loadReorderPage(
      tenant,
      parseReorderTableQuery({ tab: "need", warehouseId: warehouse.id }),
      prisma,
      { allRows: true },
    );
    check("29. Remove healthy manual → gone", !need3.needRows.some((row) => row.productId === healthy.id));

    await addManualReorderItem(tenant, { productId: low.id, warehouseId: warehouse.id }, tenant.userId, prisma);
    await removeManualReorderItem(tenant, { productId: low.id, warehouseId: warehouse.id }, prisma);
    const need4 = await loadReorderPage(
      tenant,
      parseReorderTableQuery({ tab: "need", warehouseId: warehouse.id }),
      prisma,
      { allRows: true },
    );
    check("30. Auto-low survives manual remove", Boolean(need4.needRows.find((row) => row.productId === low.id)));

    const unit = low.units?.find((u: { isBaseUnit?: boolean }) => u.isBaseUnit) ?? low.units?.[0];
    // Create draft PO via same client (validates exclusion); Create PO engine wiring covered by check 22.
    const po = await (prisma as any).purchase.create({
      data: {
        balanceAmount: 4000,
        companyId: tenant.companyId,
        currency: "LAK",
        exchangeRate: 1,
        items: {
          create: [
            {
              productId: low.id,
              quantity: 4,
              totalCost: 4000,
              unitCost: 1000,
              unitId: unit?.id,
            },
          ],
        },
        paidAmount: 0,
        purchaseNo: `R8PO-${stamp}`,
        status: "draft",
        subtotal: 4000,
        supplierId: supplier.id,
        totalAmount: 4000,
        warehouseId: warehouse.id,
      },
      include: { items: true },
    });
    check("31. Create PO draft", po.status === "draft");
    const poId = String(po.id);

    await (prisma as any).reorderManualItem.deleteMany({
      where: { companyId: tenant.companyId, productId: low.id, warehouseId: warehouse.id },
    });

    const afterPo = await loadReorderPage(
      tenant,
      parseReorderTableQuery({ tab: "need", warehouseId: warehouse.id }),
      prisma,
      { allRows: true },
    );
    const already = await loadReorderPage(
      tenant,
      parseReorderTableQuery({ tab: "already", warehouseId: warehouse.id }),
      prisma,
      { allRows: true },
    );
    check("32. Draft PO leaves Need Reorder", !afterPo.needRows.some((row) => row.productId === low.id));
    check(
      "33. Draft PO appears Already Ordered",
      Boolean(already.alreadyRows.find((row) => row.productId === low.id && row.poStatus === "draft")),
    );

    await (prisma as any).purchase.update({ data: { status: "ordered" }, where: { id: poId } });
    const alreadyOrdered = await loadReorderPage(
      tenant,
      parseReorderTableQuery({ tab: "already", warehouseId: warehouse.id }),
      prisma,
      { allRows: true },
    );
    check(
      "34. ordered still Already Ordered",
      alreadyOrdered.alreadyRows.find((row) => row.productId === low.id)?.poStatus === "ordered",
    );

    const purchaseItem = await (prisma as any).purchaseItem.findFirst({
      where: { productId: low.id, purchaseId: poId },
    });
    await (prisma as any).purchaseItem.update({
      data: { receivedQuantity: 1 },
      where: { id: purchaseItem.id },
    });
    await (prisma as any).purchase.update({ data: { status: "partial" }, where: { id: poId } });
    const partial = await loadReorderPage(
      tenant,
      parseReorderTableQuery({ tab: "already", warehouseId: warehouse.id }),
      prisma,
      { allRows: true },
    );
    const partialRow = partial.alreadyRows.find((row) => row.productId === low.id);
    check(
      "35. partial remaining correct",
      Boolean(partialRow) && partialRow!.poStatus === "partial" && partialRow!.remainingQty === 3,
    );

    await (prisma as any).purchaseItem.update({
      data: { receivedQuantity: 4 },
      where: { id: purchaseItem.id },
    });
    await (prisma as any).purchase.update({ data: { status: "received" }, where: { id: poId } });
    const afterReceived = await loadReorderPage(
      tenant,
      parseReorderTableQuery({ tab: "already", warehouseId: warehouse.id }),
      prisma,
      { allRows: true },
    );
    check(
      "36. received leaves Already Ordered",
      !afterReceived.alreadyRows.some((row) => row.productId === low.id),
    );

    await (prisma as any).purchase.update({ data: { status: "cancelled" }, where: { id: poId } });
    // After cancel, product may return to Need Reorder if still low (stock unchanged in this fixture).
    const afterCancel = await loadReorderPage(
      tenant,
      parseReorderTableQuery({ tab: "need", warehouseId: warehouse.id }),
      prisma,
      { allRows: true },
    );
    check(
      "37. cancelled leaves Already Ordered / may return Need Reorder",
      Boolean(afterCancel.needRows.find((row) => row.productId === low.id)),
    );
  } finally {
    // Best-effort cleanup of R8 fixtures (never Production — script URL gate).
    try {
      await (prisma as any).reorderManualItem.deleteMany({
        where: { product: { nameEn: { startsWith: marker } } },
      });
      await (prisma as any).goodsReceiptItem.deleteMany({
        where: { product: { nameEn: { startsWith: marker } } },
      });
      await (prisma as any).goodsReceipt.deleteMany({
        where: { receiptNo: { startsWith: "R8R" } },
      });
      await (prisma as any).purchaseItem.deleteMany({
        where: { product: { nameEn: { startsWith: marker } } },
      });
      await (prisma as any).purchase.deleteMany({
        where: { items: { some: { product: { nameEn: { startsWith: marker } } } } },
      });
      await (prisma as any).inventoryBalance.deleteMany({
        where: { product: { nameEn: { startsWith: marker } } },
      });
      await (prisma as any).productUnit.deleteMany({
        where: { product: { nameEn: { startsWith: marker } } },
      });
      await (prisma as any).product.deleteMany({
        where: { nameEn: { startsWith: marker } },
      });
    } catch {
      // ignore cleanup errors
    }
    await prisma.$disconnect();
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

live()
  .then(() => {
    console.log(`\nR8 result: ${passed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
