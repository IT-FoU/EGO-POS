import { missingBarcodeUnits, sellableCoverageUnits } from "@/features/products/unit-coverage";

/**
 * Barcode audit follows POS scan resolution in features/pos/pos-cart.ts.
 *
 * A scan matches the first active unit (status is not inactive) with that exact
 * barcode. Two products with such a unit are a scanner conflict. Two active
 * units on the same product are also flagged here, because the scanner keeps
 * only the first unit. A product barcode is a fallback only when no active unit
 * owns that code. The same code on a product and its own unit is one barcode.
 *
 * Missing barcodes use the STEP B sellable-unit rule. Inactive units are not
 * missing-barcode issues, and their barcodes are not scan targets.
 *
 * Invalid format is not applicable. POS accepts any non-empty barcode and the
 * product save path only trims the value.
 */
export const BARCODE_AUDIT_INVALID_RULE = "not_applicable" as const;

export type BarcodeAuditIssueType = "missing" | "duplicate" | "conflict";

export type BarcodeAuditUnit = {
  allowManualUnitSelect?: boolean;
  barcode?: string | null;
  sortOrder?: number;
  status?: string | null;
  unitName?: string | null;
};

export type BarcodeAuditProduct = {
  barcode?: string | null;
  id: string;
  nameEn?: string | null;
  nameLo?: string | null;
  sku?: string | null;
  status?: string | null;
  units?: BarcodeAuditUnit[] | null;
};

export type BarcodeAuditIssue = {
  barcode: string;
  details: "missing_barcode" | "scan_conflict" | "shared_barcode";
  issue: BarcodeAuditIssueType;
  nameEn: string;
  nameLo: string;
  productId: string;
  productName: string;
  sku: string;
  status: string;
  unitName: string;
};

export type BarcodeAuditResult = {
  conflictCount: number;
  duplicateCount: number;
  invalidCount: number;
  invalidRule: typeof BARCODE_AUDIT_INVALID_RULE;
  issues: BarcodeAuditIssue[];
  missingCount: number;
  missingProductIds: string[];
  productsChecked: number;
  unitsChecked: number;
};

type ScanTarget = {
  barcode: string;
  key: string;
  kind: "unit" | "product";
  nameEn: string;
  nameLo: string;
  productId: string;
  productName: string;
  sku: string;
  status: string;
  unitName: string;
};

export function buildBarcodeAudit(products: BarcodeAuditProduct[]): BarcodeAuditResult {
  const issues: BarcodeAuditIssue[] = [];
  let unitsChecked = 0;
  for (const product of products) {
    unitsChecked += sellableCoverageUnits(product).length;
    for (const unit of missingBarcodeUnits(product)) {
      issues.push(issueFrom(product, {
        barcode: "",
        details: "missing_barcode",
        issue: "missing",
        unitName: clean(unit.unitName) || "Piece",
      }));
    }
  }

  const groups = new Map<string, ScanTarget[]>();
  for (const target of products.flatMap(scanTargets)) {
    const group = groups.get(target.barcode) ?? [];
    group.push(target);
    groups.set(target.barcode, group);
  }
  for (const [barcode, group] of groups) {
    if (group.length < 2) continue;
    const ambiguous = ambiguousKeys(group);
    for (const target of group) {
      const conflict = ambiguous.has(target.key);
      issues.push({
        barcode,
        details: conflict ? "scan_conflict" : "shared_barcode",
        issue: conflict ? "conflict" : "duplicate",
        nameEn: target.nameEn,
        nameLo: target.nameLo,
        productId: target.productId,
        productName: target.productName,
        sku: target.sku,
        status: target.status,
        unitName: target.unitName,
      });
    }
  }

  const ordered = issues.sort(compareIssues);
  const missingProductIds = [...new Set(ordered.filter((issue) => issue.issue === "missing").map((issue) => issue.productId))].sort();
  return {
    conflictCount: ordered.filter((issue) => issue.issue === "conflict").length,
    duplicateCount: ordered.filter((issue) => issue.issue === "duplicate" || issue.issue === "conflict").length,
    invalidCount: 0,
    invalidRule: BARCODE_AUDIT_INVALID_RULE,
    issues: ordered,
    missingCount: ordered.filter((issue) => issue.issue === "missing").length,
    missingProductIds,
    productsChecked: products.length,
    unitsChecked,
  };
}

export function barcodeAuditCsv(issues: BarcodeAuditIssue[], labels: Record<BarcodeAuditIssue["details"] | BarcodeAuditIssueType, string>) {
  const headers = ["Product Name", "SKU", "Unit", "Barcode", "Issue Type", "Details"];
  const lines = [
    headers.join(","),
    ...issues.map((issue) => [
      issue.productName,
      issue.sku,
      issue.unitName,
      issue.barcode,
      labels[issue.issue] ?? issue.issue,
      labels[issue.details] ?? issue.details,
    ].map(csvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

export function barcodeAuditFilename(date = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(date);
  return `ego-barcode-audit-${day}.csv`;
}

function scanTargets(product: BarcodeAuditProduct): ScanTarget[] {
  const units = product.units ?? [];
  const shared = {
    nameEn: clean(product.nameEn),
    nameLo: clean(product.nameLo),
    productId: product.id,
    productName: displayName(product),
    sku: clean(product.sku),
    status: clean(product.status) || "active",
  };
  if (units.length === 0) {
    const barcode = clean(product.barcode);
    return barcode ? [{ ...shared, barcode, key: `${product.id}|legacy`, kind: "unit", unitName: "Piece" }] : [];
  }
  const active = units.filter((unit) => (unit.status ?? "active") !== "inactive");
  const targets: ScanTarget[] = [];
  active.forEach((unit, index) => {
    const barcode = clean(unit.barcode);
    if (!barcode) return;
    targets.push({
      ...shared,
      barcode,
      key: `${product.id}|unit|${index}|${clean(unit.unitName)}`,
      kind: "unit",
      unitName: clean(unit.unitName) || "Unit",
    });
  });
  const productBarcode = clean(product.barcode);
  const coveredByUnit = active.some((unit) => clean(unit.barcode) === productBarcode);
  if (productBarcode && !coveredByUnit) {
    targets.push({
      ...shared,
      barcode: productBarcode,
      key: `${product.id}|product`,
      kind: "product",
      unitName: "Product",
    });
  }
  return targets;
}

function ambiguousKeys(group: ScanTarget[]) {
  const keys = new Set<string>();
  const unitTargets = group.filter((target) => target.kind === "unit");
  const byProduct = new Map<string, ScanTarget[]>();
  for (const target of unitTargets) {
    const list = byProduct.get(target.productId) ?? [];
    list.push(target);
    byProduct.set(target.productId, list);
  }
  if (byProduct.size > 1) {
    for (const target of unitTargets) keys.add(target.key);
    return keys;
  }
  if (byProduct.size === 1) {
    const only = [...byProduct.values()][0] ?? [];
    if (only.length > 1) {
      for (const target of only) keys.add(target.key);
    }
    return keys;
  }
  const productTargets = group.filter((target) => target.kind === "product");
  if (productTargets.length > 1) {
    for (const target of productTargets) keys.add(target.key);
  }
  return keys;
}

function compareIssues(left: BarcodeAuditIssue, right: BarcodeAuditIssue) {
  const order = { missing: 0, conflict: 1, duplicate: 2 };
  return order[left.issue] - order[right.issue]
    || left.productName.localeCompare(right.productName)
    || left.unitName.localeCompare(right.unitName)
    || left.barcode.localeCompare(right.barcode);
}

function issueFrom(product: BarcodeAuditProduct, issue: Pick<BarcodeAuditIssue, "barcode" | "details" | "issue" | "unitName">): BarcodeAuditIssue {
  return {
    ...issue,
    nameEn: clean(product.nameEn),
    nameLo: clean(product.nameLo),
    productId: product.id,
    productName: displayName(product),
    sku: clean(product.sku),
    status: clean(product.status) || "active",
  };
}

function displayName(product: BarcodeAuditProduct) {
  return clean(product.nameLo) || clean(product.nameEn);
}

function clean(value?: string | null) {
  return String(value ?? "").trim();
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
