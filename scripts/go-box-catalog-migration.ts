import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const OPENING_NOTE = "Legacy GO BOX Opening Stock Migration";
const OPENING_REFERENCE_TYPE = "go_box_opening";
const UNCATEGORIZED = "Uncategorized";
const DEFAULT_SOURCE =
  "D:\\ແຄັດຕະລອກເຄື່ອງ20,8.xlsx - Sheet1.csv";
const REPORT_DIR = join(process.env.LOCALAPPDATA ?? ".", "ego-pos-production");

type SourceKind = "gobox-catalog" | "xkeep-html" | "wholesale-quote" | "generic-csv" | "unknown";
type RejectCode =
  | "EMPTY_NAME"
  | "MISSING_SELLING_PRICE"
  | "INVALID_PRICE"
  | "INVALID_STOCK"
  | "BARCODE_CONFLICT"
  | "BARCODE_CORRUPT"
  | "UNIT_CONVERSION_AMBIGUOUS"
  | "WHOLESALE_QUOTE_NOT_STORE_POS"
  | "SYNTHETIC_DEMO"
  | "INCOMPLETE_XKEEP_DUMP";

type RawRow = {
  sourceIndex: number;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  costText: string;
  sellingText: string;
  stockText: string;
  minStockText: string;
  unitText: string;
};

type PreparedRow = {
  sourceIndex: number;
  sku: string;
  barcode: string;
  nameLo: string;
  categoryName: string;
  costPriceLak: number;
  sellingPriceLak: number | null;
  openingStock: number | null;
  minStock: number;
  unitName: string;
  conversionQty: number | null;
  conversionNote: string | null;
  imagePath: string | null;
  needsCostReview: boolean;
  rejectCodes: RejectCode[];
  warnings: string[];
};

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

function parseArgs(argv: string[]) {
  const args = {
    apply: false,
    dryRun: false,
    limit: 0,
    batchSize: 150,
    source: DEFAULT_SOURCE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") args.apply = true;
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--limit") args.limit = Number(argv[++index] ?? 0);
    else if (token === "--batch-size") args.batchSize = Number(argv[++index] ?? 150);
    else if (token === "--source") args.source = argv[++index] ?? args.source;
  }
  if (!args.apply && !args.dryRun) args.dryRun = true;
  if (args.apply && args.dryRun) {
    throw new Error("Use only one of --dry-run or --apply");
  }
  if (!Number.isFinite(args.batchSize) || args.batchSize < 1) args.batchSize = 150;
  if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = 0;
  return args;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      if (cell.endsWith("\r")) cell = cell.slice(0, -1);
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim().length > 0));
}

function normalizeHeader(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function detectKind(headers: string[], filePath: string, sample: string): SourceKind {
  const joined = headers.map(normalizeHeader).join("|");
  if (/product 1|ສິນຄ້າເລກ 1|product_list_laos/i.test(sample) || /product_list_laos/i.test(filePath)) {
    return "unknown";
  }
  if (joined.includes("wsprice3") || joined.includes("itemcode")) return "wholesale-quote";
  if (joined.includes("barcode หลัก") || joined.includes("รหัสสินค้า")) return "gobox-catalog";
  if (joined.includes("ລາຄາ1") || joined.includes("ຄ່າໃຊ້ຈ່າຍ") || joined.includes("ຈຳນວນສະຕັອກ")) {
    return "xkeep-html";
  }
  if (joined.includes("barcode") || joined.includes("ບາໂຄດ")) return "generic-csv";
  return "unknown";
}

function stripHtml(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

function parseXkeepHtml(text: string): string[][] {
  const rows = [...text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
    [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripHtml(cell[1])),
  );
  return rows.filter((row) => row.some((cell) => cell.length > 0));
}

function cell(row: string[], index: number) {
  return String(row[index] ?? "").trim();
}

function pickColumn(headers: string[], aliases: string[]) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const index = normalized.findIndex((header) => header === alias || header.includes(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function mapRows(kind: SourceKind, headers: string[], data: string[][]): RawRow[] {
  const skuIndex = pickColumn(headers, ["รหัสสินค้า", "sku", "itemcode", "ລະຫັດ", "product code"]);
  const barcodeIndex = pickColumn(headers, ["barcode หลัก", "barcode", "ບາໂຄດ", "bar code"]);
  const nameIndex = pickColumn(headers, ["ชื่อสินค้า", "ຊື່ຜະລິດຕະພັນ", "laoname", "name", "ລາຍລະອຽດ"]);
  const categoryIndex = pickColumn(headers, ["ປະເພດ", "category", "ໝວດ"]);
  const costIndex = pickColumn(headers, ["ຄ່າໃຊ້ຈ່າຍ", "cost", "cost price"]);
  const sellingIndex = pickColumn(headers, ["ລາຄາ1", "selling", "price", "ລາຄາ"]);
  const stockIndex = pickColumn(headers, ["ຈຳນວນສະຕັອກ", "ຈໍານວນທີ່ຍັງເຫຼືອ", "stock", "qty"]);
  const minIndex = pickColumn(headers, ["ແຈ້ງເຕື່ອນ", "min stock", "minstock"]);
  const unitIndex = pickColumn(headers, ["uom", "ຈໍານວນຫນ່ວຍ", "unit", "ບັນຈຸ"]);

  return data.map((row, index) => {
    let barcode = barcodeIndex >= 0 ? cell(row, barcodeIndex) : "";
    let sku = skuIndex >= 0 ? cell(row, skuIndex) : "";
    if (kind === "xkeep-html") {
      const code = (barcode || sku).replace(/\s*(ພິມບາໂຄດ|QRCODE).*$/i, "").trim();
      barcode = code;
      sku = sku || code;
    }
    if (kind === "gobox-catalog") {
      sku = cell(row, 1);
      barcode = cell(row, 2);
    }
    return {
      sourceIndex: index + 2,
      sku,
      barcode,
      name: nameIndex >= 0 ? cell(row, nameIndex) : kind === "gobox-catalog" ? cell(row, 3) : "",
      category: categoryIndex >= 0 ? cell(row, categoryIndex) : "",
      costText: costIndex >= 0 ? cell(row, costIndex) : "",
      sellingText: sellingIndex >= 0 ? cell(row, sellingIndex) : "",
      stockText: stockIndex >= 0 ? cell(row, stockIndex) : "",
      minStockText: minIndex >= 0 ? cell(row, minIndex) : "",
      unitText: unitIndex >= 0 ? cell(row, unitIndex) : "",
    };
  });
}

function preserveBarcode(raw: string): { barcode: string; corrupt: boolean } {
  const value = raw.replace(/\s+/g, "").trim();
  if (!value) return { barcode: "", corrupt: false };
  if (/[eE][+-]?\d/.test(value) || value.includes(".")) {
    return { barcode: value, corrupt: true };
  }
  if (!/^[0-9A-Za-z-]+$/.test(value)) {
    return { barcode: value.replace(/[^0-9A-Za-z-]/g, ""), corrupt: false };
  }
  return { barcode: value, corrupt: false };
}

function parseLak(raw: string): { ok: true; value: number } | { ok: false; reason: string } | { ok: true; value: null } {
  const text = raw.replace(/₭/g, "").replace(/lak/gi, "").trim();
  if (!text) return { ok: true, value: null };
  if (/[eE][+-]?\d/.test(text)) return { ok: false, reason: "scientific-notation" };
  const compact = text.replace(/,/g, "").replace(/\s+/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(compact)) return { ok: false, reason: "nonsensical-price" };
  const value = Number(compact);
  if (!Number.isFinite(value) || value < 0) return { ok: false, reason: "negative-or-nan" };
  if (value > 100_000_000) return { ok: false, reason: "price-out-of-range" };
  return { ok: true, value };
}

function parseQuantity(raw: string): { ok: true; value: number | null } | { ok: false } {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  const leading = text.match(/-?\d+(?:\.\d+)?/);
  if (!leading) return { ok: false };
  const value = Number(leading[0]);
  if (!Number.isFinite(value)) return { ok: false };
  return { ok: true, value };
}

function packHint(name: string, unitText: string) {
  const source = `${name} ${unitText}`;
  const match = source.match(/1\s*[x×*]\s*(\d+)/i) || source.match(/\(\s*1\s*\*\s*(\d+)/);
  if (!match) return null;
  return {
    qty: Number(match[1]),
    note: `Name/unit text contains pack hint ${match[0]} — not imported as conversion`,
  };
}

function normalizeCategory(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return UNCATEGORIZED;
  return trimmed.replace(/\s+/g, " ");
}

function categoryKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function generatedSku(index: number) {
  return `GB-${String(index).padStart(6, "0")}`;
}

function prepareRows(kind: SourceKind, rawRows: RawRow[]): PreparedRow[] {
  const barcodeOwners = new Map<string, Set<string>>();
  for (const row of rawRows) {
    const barcodeResult = preserveBarcode(row.barcode);
    if (!barcodeResult.barcode || barcodeResult.corrupt) continue;
    const identity = `${row.sku.trim()}||${row.name.trim()}`;
    const owners = barcodeOwners.get(barcodeResult.barcode) ?? new Set<string>();
    owners.add(identity);
    barcodeOwners.set(barcodeResult.barcode, owners);
  }

  return rawRows.map((row, index) => {
    const rejectCodes: RejectCode[] = [];
    const warnings: string[] = [];
    if (kind === "wholesale-quote") rejectCodes.push("WHOLESALE_QUOTE_NOT_STORE_POS");
    if (kind === "unknown") rejectCodes.push("SYNTHETIC_DEMO");
    if (kind === "xkeep-html") warnings.push("XKeep HTML dump must be a complete unique catalog, not a paginated repeat");

    const nameLo = row.name.trim();
    if (!nameLo) rejectCodes.push("EMPTY_NAME");

    const barcodeResult = preserveBarcode(row.barcode);
    const barcode = barcodeResult.barcode;
    if (barcodeResult.corrupt) rejectCodes.push("BARCODE_CORRUPT");
    if (barcode && (barcodeOwners.get(barcode)?.size ?? 0) > 1) rejectCodes.push("BARCODE_CONFLICT");

    const selling = parseLak(row.sellingText);
    const cost = parseLak(row.costText);
    let sellingPriceLak: number | null = null;
    let costPriceLak = 0;
    let needsCostReview = false;
    if (!selling.ok) rejectCodes.push("INVALID_PRICE");
    else if (selling.value === null) rejectCodes.push("MISSING_SELLING_PRICE");
    else sellingPriceLak = selling.value;

    if (!cost.ok) {
      warnings.push("Invalid cost parsed as missing");
      needsCostReview = true;
    } else if (cost.value === null) {
      needsCostReview = true;
    } else {
      costPriceLak = cost.value;
    }

    const stock = parseQuantity(row.stockText);
    const minStockParsed = parseQuantity(row.minStockText);
    let openingStock: number | null = null;
    if (!stock.ok) rejectCodes.push("INVALID_STOCK");
    else openingStock = stock.value;
    if (openingStock !== null && openingStock < 0) {
      rejectCodes.push("INVALID_STOCK");
    }

    const hint = packHint(nameLo, row.unitText);
    let conversionQty: number | null = null;
    let conversionNote: string | null = null;
    if (hint && Number.isInteger(hint.qty) && hint.qty > 1) {
      conversionNote = hint.note;
      warnings.push("UNIT_CONVERSION_AMBIGUOUS");
    }

    const sku = row.sku.trim() || generatedSku(index + 1);

    return {
      sourceIndex: row.sourceIndex,
      sku,
      barcode,
      nameLo,
      categoryName: normalizeCategory(row.category),
      costPriceLak,
      sellingPriceLak,
      openingStock,
      minStock: minStockParsed.ok && minStockParsed.value !== null && minStockParsed.value >= 0 ? minStockParsed.value : 0,
      unitName: row.unitText.trim() || "Piece",
      conversionQty,
      conversionNote,
      imagePath: null,
      needsCostReview,
      rejectCodes: [...new Set(rejectCodes)],
      warnings,
    };
  });
}

function isImportable(row: PreparedRow) {
  return row.rejectCodes.length === 0 && row.sellingPriceLak !== null && row.nameLo.length > 0;
}

function detectRepeatedXkeep(rows: RawRow[]) {
  if (rows.length < 20) return rows.length > 0 && rows.length < 10;
  const first = rows[0]?.barcode;
  const later = rows.filter((_, index) => index >= 10).filter((row) => row.barcode === first).length;
  return later > 5;
}

async function applyAtomicStockDelta(
  tx: any,
  input: { companyId: string; productId: string; quantityDelta: number; warehouseId: string },
) {
  const quantityDelta = input.quantityDelta;
  if (quantityDelta === 0) throw new Error("Stock movement quantity must not be zero.");
  if (quantityDelta > 0) {
    await tx.inventoryBalance.upsert({
      create: {
        companyId: input.companyId,
        productId: input.productId,
        quantity: quantityDelta,
        warehouseId: input.warehouseId,
      },
      update: { quantity: { increment: quantityDelta } },
      where: { warehouseId_productId: { productId: input.productId, warehouseId: input.warehouseId } },
    });
    const balance = await tx.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_productId: { productId: input.productId, warehouseId: input.warehouseId } },
    });
    const afterQty = Number(balance.quantity);
    return { afterQty, beforeQty: afterQty - quantityDelta };
  }
  throw new Error("Opening stock migration only applies non-negative quantities");
}

function writeReports(summary: Record<string, unknown>, rejects: PreparedRow[]) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = join(REPORT_DIR, "go-box-catalog-migration-result.json");
  const mdPath = join(REPORT_DIR, "go-box-catalog-migration-result.md");
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  const rejectLines = rejects.slice(0, 50).map(
    (row) => `- row ${row.sourceIndex} sku=${row.sku} codes=${row.rejectCodes.join(",")}`,
  );
  const markdown = [
    "# GO BOX Catalog Migration Report",
    "",
    "Detailed product names, barcodes, and prices are omitted from this summary.",
    "Full machine profile: `%LOCALAPPDATA%\\ego-pos-production\\go-box-catalog-migration-dry-run.json`",
    "",
    ...Object.entries(summary)
      .filter(([, value]) => typeof value !== "object")
      .map(([key, value]) => `- **${key}:** ${String(value)}`),
    "",
    "## Reject samples (sku/codes only)",
    ...rejectLines,
    "",
  ].join("\n");
  writeFileSync(mdPath, `${markdown}\n`);
  return { jsonPath, mdPath };
}

async function main() {
  loadEnv();
  process.env.IGO_DEMO_MODE = "false";
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.source)) {
    throw new Error(`Source file not found: ${args.source}`);
  }

  const sample = readFileSync(args.source, "utf8");
  const table = args.source.toLowerCase().endsWith(".xls") && sample.includes("<tr")
    ? parseXkeepHtml(sample)
    : parseCsv(sample);
  const headers = table[0] ?? [];
  const kind = detectKind(headers, args.source, sample.slice(0, 2000));
  const rawRows = mapRows(kind, headers, table.slice(1));
  const prepared = prepareRows(kind, rawRows);
  const limited = args.limit > 0 ? prepared.slice(0, args.limit) : prepared;
  const xkeepRepeated = kind === "xkeep-html" && detectRepeatedXkeep(rawRows);
  if (xkeepRepeated) {
    for (const row of limited) {
      if (!row.rejectCodes.includes("INCOMPLETE_XKEEP_DUMP")) row.rejectCodes.push("INCOMPLETE_XKEEP_DUMP");
    }
  }

  const importable = limited.filter(isImportable);
  const rejected = limited.filter((row) => !isImportable(row));
  const barcodeConflicts = limited.filter((row) => row.rejectCodes.includes("BARCODE_CONFLICT")).length;
  const missingBarcode = limited.filter((row) => !row.barcode).length;
  const missingCost = limited.filter((row) => row.needsCostReview).length;
  const missingSelling = limited.filter((row) => row.rejectCodes.includes("MISSING_SELLING_PRICE")).length;
  const categories = new Map<string, string>();
  for (const row of importable) categories.set(categoryKey(row.categoryName), row.categoryName);
  const scientific = limited.filter((row) => row.rejectCodes.includes("BARCODE_CORRUPT")).length;
  const uniqueBarcodes = new Set(limited.map((row) => row.barcode).filter(Boolean)).size;
  const uniqueSkus = new Set(limited.map((row) => row.sku)).size;
  const sourceComplete = importable.length > 0 && missingSelling < limited.length;

  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    sourcePath: args.source,
    sourceKind: kind,
    sourceRows: rawRows.length,
    preparedRows: limited.length,
    validProducts: importable.length,
    rejectedRows: rejected.length,
    duplicateBarcodeConflicts: barcodeConflicts,
    missingBarcode,
    missingCost,
    missingSellingPrice: missingSelling,
    uniqueBarcodes,
    uniqueSkus,
    categoriesWouldImport: categories.size,
    unitConversionsImported: 0,
    scientificNotationBarcodes: scientific,
    xkeepRepeatedDump: xkeepRepeated,
    sourceComplete,
    importReadyCount: importable.length,
    writes: 0,
    decision: sourceComplete ? "READY_FOR_CANARY" : "MIGRATION_BLOCKED",
  };

  const reports = writeReports(
    {
      ...summary,
      rejectCodeCounts: rejected.reduce<Record<string, number>>((acc, row) => {
        for (const code of row.rejectCodes) acc[code] = (acc[code] ?? 0) + 1;
        return acc;
      }, {}),
    },
    rejected,
  );

  console.log(JSON.stringify({ ...summary, report: reports.mdPath }, null, 2));

  if (!args.apply) {
    return;
  }

  if (!sourceComplete || importable.length === 0) {
    throw new Error("Refusing --apply: source is not a complete GO BOX POS catalog with selling prices and current stock");
  }

  loadProjectEnvFiles();
  const url = resolveScriptDatabaseUrl("production-migration");
  if (!url.includes(TARGET_REF) || url.includes(GOFLO_REF) || url.includes(OLD_PRO_REF)) {
    throw new Error("Refusing apply: DATABASE_URL is not Production ieutdqnlfiiaawctapor");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } }),
  });

  try {
    const company = await prisma.company.findFirstOrThrow({ where: { storeCode: "0001" } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { companyId: company.id, isMainBranch: true } });
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId: company.id, name: "Main Warehouse" } });
    const owner = await prisma.companyUser.findFirst({ where: { companyId: company.id, isOwner: true } });

    let imported = 0;
    for (let offset = 0; offset < importable.length; offset += args.batchSize) {
      const batch = importable.slice(offset, offset + args.batchSize);
      await prisma.$transaction(async (tx: any) => {
        for (const row of batch) {
          const existing = await tx.product.findFirst({
            where: { companyId: company.id, sku: row.sku },
            include: { units: true },
          });
          let category = await tx.category.findFirst({
            where: { branchId: branch.id, companyId: company.id, nameLo: row.categoryName },
          });
          if (!category) {
            category = await tx.category.create({
              data: {
                branchId: branch.id,
                companyId: company.id,
                nameEn: row.categoryName,
                nameLo: row.categoryName,
              },
            });
          }

          let product = existing;
          if (!product) {
            product = await tx.product.create({
              data: {
                barcode: row.barcode || null,
                branchId: branch.id,
                categoryId: category.id,
                companyId: company.id,
                costPriceLak: row.costPriceLak,
                minStock: row.minStock,
                nameEn: row.nameLo,
                nameLo: row.nameLo,
                productCode: row.sku,
                sellingPriceLak: row.sellingPriceLak ?? 0,
                sku: row.sku,
                status: "active",
                isActive: true,
                units: {
                  create: [
                    {
                      barcode: row.barcode || null,
                      conversionQty: 1,
                      costPriceLak: row.costPriceLak,
                      isBaseUnit: true,
                      isDefaultSaleUnit: true,
                      isPurchaseUnit: true,
                      sellingPriceLak: row.sellingPriceLak ?? 0,
                      sortOrder: 0,
                      unitName: "Piece",
                    },
                  ],
                },
              },
              include: { units: true },
            });
            const baseUnit = product.units.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit) ?? product.units[0];
            await tx.product.update({ data: { baseUnitId: baseUnit?.id }, where: { id: product.id } });
            imported += 1;
          }

          if (row.openingStock && row.openingStock > 0) {
            const referenceId = `legacy-opening:${row.sku}`;
            const already = await tx.stockMovement.findFirst({
              where: {
                companyId: company.id,
                productId: product.id,
                referenceId,
                referenceType: OPENING_REFERENCE_TYPE,
              },
            });
            if (!already) {
              const unit = product.units.find((item: { isBaseUnit: boolean }) => item.isBaseUnit) ?? product.units[0];
              const balance = await applyAtomicStockDelta(tx, {
                companyId: company.id,
                productId: product.id,
                quantityDelta: row.openingStock,
                warehouseId: warehouse.id,
              });
              if (balance.afterQty - balance.beforeQty !== row.openingStock) {
                throw new Error(`Opening stock delta mismatch for ${row.sku}`);
              }
              await tx.stockMovement.create({
                data: {
                  afterQty: balance.afterQty,
                  beforeQty: balance.beforeQty,
                  companyId: company.id,
                  createdBy: owner?.userId ?? null,
                  movementType: "adjustment",
                  note: OPENING_NOTE,
                  productId: product.id,
                  quantity: row.openingStock,
                  referenceId,
                  referenceType: OPENING_REFERENCE_TYPE,
                  unitId: unit?.id,
                  warehouseId: warehouse.id,
                },
              });
            }
          }
        }
      });
    }
    console.log(JSON.stringify({ applyImported: imported, applyAttempted: importable.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(String(error?.stack ?? error));
  process.exit(1);
});
