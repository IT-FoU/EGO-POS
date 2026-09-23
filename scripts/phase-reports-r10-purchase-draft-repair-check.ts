/**
 * REPORTS R10 — Purchase Draft / Order Unit / Supplier-safe document repair checks.
 * Static math + marker checks only. Does NOT touch Production.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyReorderPurchaseUnitRole,
  filterReorderPurchaseUnits,
  pickDefaultReorderPurchaseUnit,
  suggestedPurchaseQtyFromBase,
  supplierOrderBarcode,
  SUPPLIER_ORDER_COLUMNS,
} from "../features/reports/reorder-report-math";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";

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

type U = {
  id: string;
  isBaseUnit: boolean;
  isPurchaseUnit: boolean;
  unitName: string;
  conversionQty: number;
  barcode?: string | null;
};

function unit(partial: Partial<U> & Pick<U, "id" | "unitName">): U {
  return {
    barcode: null,
    conversionQty: 1,
    isBaseUnit: false,
    isPurchaseUnit: true,
    ...partial,
  };
}

check("1. EN/LO reports copy key parity", reportsCopyKeyParity());
check("2. Lao reports copy has no replacement chars", reportsCopyHasNoReplacementChars());

const newKeys = [
  "addToPurchase",
  "purchaseDraft",
  "purchaseDraftHint",
  "purchaseDraftItems",
  "purchaseDraftEmpty",
  "purchaseDraftRef",
  "removeFromDraft",
  "closeDraft",
  "supplierOrderDoc",
  "addToPurchaseFirst",
  "supplierGroupsCount",
];
check(
  "3. New purchase-draft EN/LO keys present",
  newKeys.every((key) => Boolean(tReports(key, "en")) && Boolean(tReports(key, "lo"))),
);
check(
  "4. New Lao keys use Lao script (no Thai)",
  newKeys.every((key) => !thaiScript.test(tReports(key, "lo"))),
);

const pieceOnly = [unit({ id: "p", unitName: "Piece", isBaseUnit: true, isPurchaseUnit: true })];
check(
  "5. Piece only → Piece visible + default",
  filterReorderPurchaseUnits(pieceOnly).length === 1 &&
    pickDefaultReorderPurchaseUnit(pieceOnly)?.id === "p" &&
    classifyReorderPurchaseUnitRole("Piece") === "piece",
);

const piecePack = [
  unit({ id: "p", unitName: "Piece", isBaseUnit: true, isPurchaseUnit: true }),
  unit({ id: "pk", unitName: "Pack", conversionQty: 6, isPurchaseUnit: true }),
];
check(
  "6. Piece + Pack → both visible, Pack default (no Box)",
  filterReorderPurchaseUnits(piecePack).length === 2 &&
    pickDefaultReorderPurchaseUnit(piecePack)?.id === "pk",
);

const pieceBox = [
  unit({ id: "p", unitName: "Piece", isBaseUnit: true, isPurchaseUnit: true }),
  unit({ id: "b", unitName: "Box", conversionQty: 24, isPurchaseUnit: true }),
];
check(
  "7. Piece + Box → both visible, Box default",
  filterReorderPurchaseUnits(pieceBox).length === 2 &&
    pickDefaultReorderPurchaseUnit(pieceBox)?.id === "b",
);

const allThree = [
  unit({ id: "p", unitName: "Piece", isBaseUnit: true, isPurchaseUnit: true }),
  unit({ id: "pk", unitName: "Pack", conversionQty: 6, isPurchaseUnit: true }),
  unit({ id: "b", unitName: "Box", conversionQty: 24, isPurchaseUnit: true }),
];
check(
  "8. Piece + Pack + Box → all visible, Box default",
  filterReorderPurchaseUnits(allThree).length === 3 &&
    pickDefaultReorderPurchaseUnit(allThree)?.id === "b",
);

const withDisabled = [
  unit({ id: "p", unitName: "Piece", isBaseUnit: true, isPurchaseUnit: true }),
  unit({ id: "pk", unitName: "Pack", conversionQty: 6, isPurchaseUnit: false }),
  unit({ id: "b", unitName: "Box", conversionQty: 24, isPurchaseUnit: true }),
];
check(
  "9. Disabled Pack absent; Box still default",
  filterReorderPurchaseUnits(withDisabled).map((u) => u.id).join(",") === "p,b" &&
    pickDefaultReorderPurchaseUnit(filterReorderPurchaseUnits(withDisabled))?.id === "b",
);

check(
  "10. Suggested 19 Piece / Box 24 → 1 Box (ceil)",
  suggestedPurchaseQtyFromBase(19, 24) === 1,
);
check(
  "11. Suggested 19 Piece / Pack 6 → 4 Pack (ceil)",
  suggestedPurchaseQtyFromBase(19, 6) === 4,
);

check(
  "12. Unit barcode preferred when present",
  supplierOrderBarcode({ productBarcode: "BASE-1", unitBarcode: "BOX-99" }) === "BOX-99",
);
check(
  "13. Fallback to base/product barcode when unit barcode missing",
  supplierOrderBarcode({ productBarcode: "BASE-1", unitBarcode: null }) === "BASE-1" &&
    supplierOrderBarcode({ productBarcode: "BASE-1", unitBarcode: "" }) === "BASE-1",
);

check(
  "14. Supplier columns are only Product / Barcode / Qty / Unit",
  SUPPLIER_ORDER_COLUMNS.join(",") === "productName,barcode,orderQty,orderUnit",
);

const views = read("features/reports/components/reorder-report-views.tsx");
const math = read("features/reports/reorder-report-math.ts");
const repo = read("features/reports/reorder-report-repository.ts");
const excel = read("features/reports/reorder-report-excel.ts");

check(
  "15. Add to Purchase opens Purchase Draft (markers)",
  views.includes("addToPurchase") &&
    views.includes("purchaseDraftOpen") &&
    views.includes("onAddToPurchase") &&
    views.includes("SettingsLargeDrawer"),
);

check(
  "16. Create PO only from draft confirm after Owner action",
  views.includes("purchaseDraftRows") &&
    views.includes("onCreatePo") &&
    views.includes("createPoConfirmHint") &&
    views.includes('setConfirmOpen(true)'),
);

check(
  "17. Remove/cancel draft does not call create-po",
  views.includes("onRemoveFromDraft") &&
    views.includes("onCloseDraft") &&
    views.includes("Closing draft does not create PO") &&
    !/function onCloseDraft[\s\S]{0,400}create-po/.test(views) &&
    !/function onRemoveFromDraft[\s\S]{0,400}create-po/.test(views),
);

check(
  "18. Default unit Box > Pack > Piece helpers used",
  math.includes("pickDefaultReorderPurchaseUnit") &&
    views.includes("pickDefaultReorderPurchaseUnit") &&
    math.includes('byRole("box")') &&
    math.includes('byRole("pack")'),
);

check(
  "19. Repository filters purchase units via isPurchaseUnit",
  repo.includes("isPurchaseUnit: true") &&
    repo.includes("filterReorderPurchaseUnits") &&
    repo.includes("isPurchaseUnit: Boolean(unit.isPurchaseUnit)"),
);

{
  const start = views.indexOf("function buildSupplierOrderHtml");
  const end = views.indexOf("async function downloadHtmlAsFile");
  const block = start >= 0 && end > start ? views.slice(start, end) : "";
  const forbidden = [
    "colAvailable",
    "colOnHand",
    "colReserved",
    "colReorderLevel",
    "colTargetStock",
    "suggestedQtyBase",
    "unitCost",
    "estimatedCost",
    "reason",
  ];
  check(
    "20. Supplier HTML builder exists",
    views.includes("buildSupplierOrderHtml"),
  );
  check(
    "21. Supplier HTML block has no internal stock/cost columns",
    Boolean(block) && forbidden.every((token) => !block.includes(token)),
  );
  check(
    "22. Supplier HTML has Product / Barcode / Order Qty / Order Unit",
    block.includes('t("product"') &&
      block.includes('t("barcode"') &&
      block.includes('t("orderQty"') &&
      block.includes('t("orderUnit"'),
  );
}

check(
  "23. Supplier Excel builder exists and uses safe columns only",
  excel.includes("buildReorderSupplierOrderExcel") &&
    excel.includes('t("product", locale)') &&
    excel.includes('t("barcode", locale)') &&
    excel.includes('t("orderQty", locale)') &&
    excel.includes('t("orderUnit", locale)') &&
    !/buildReorderSupplierOrderExcel[\s\S]*colAvailable/.test(excel) &&
    !/buildReorderSupplierOrderExcel[\s\S]*suggestedQtyBase/.test(excel) &&
    !/buildReorderSupplierOrderExcel[\s\S]*unitCost/.test(excel),
);

check(
  "24. Need tab Print/Share routes through supplier draft lines",
  views.includes("buildSupplierLinesFromDraft") &&
    views.includes("addToPurchaseFirst") &&
    views.includes("onSupplierExcel"),
);

check(
  "25. History still written only via create-po repository path",
  repo.includes("reorderHistorySnapshot.createMany") &&
    !views.includes("reorderHistorySnapshot"),
);

check(
  "26. Stack files exist",
  [
    "features/reports/reorder-report-math.ts",
    "features/reports/reorder-report-repository.ts",
    "features/reports/reorder-report-excel.ts",
    "features/reports/components/reorder-report-views.tsx",
  ].every((path) => existsSync(join(ROOT, path))),
);

console.log(`\nR10 purchase-draft repair: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
