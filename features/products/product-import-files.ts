import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  PRODUCT_IMPORT_MAX_CHARS,
  PRODUCT_IMPORT_MAX_ROWS,
  mapProductImportGrid,
  parseProductImportDelimited,
  type ProductImportGridRow,
  type ProductImportIssue,
  type ProductImportParseResult,
} from "@/features/products/product-import";

export const PRODUCT_IMPORT_FORMATS = ["csv", "tsv", "xlsx", "xls", "ods"] as const;
export type ProductImportFormat = (typeof PRODUCT_IMPORT_FORMATS)[number];

export type ProductImportSheetInfo = {
  empty: boolean;
  name: string;
};

export type ProductImportFileRead = {
  format: ProductImportFormat | null;
  parsed: ProductImportParseResult;
  selectedSheet: string | null;
  sheets: ProductImportSheetInfo[];
};

const SCAN_ROW_LIMIT = PRODUCT_IMPORT_MAX_ROWS + 20;
const SCAN_COLUMN_LIMIT = 64;

export async function readProductImportFile(input: {
  bytes: Uint8Array;
  fileName: string;
  sheetName?: string;
}): Promise<ProductImportFileRead> {
  if (input.bytes.byteLength > PRODUCT_IMPORT_MAX_CHARS) {
    return blocked("file_too_large");
  }
  if (input.bytes.byteLength === 0) {
    return blocked("empty_file");
  }

  const extension = fileExtension(input.fileName);
  const sniffed = sniffProductImportBytes(input.bytes);
  const format = agreeFormat(extension, sniffed);
  if (format === "mismatch") return blocked("format_mismatch");
  if (format === "unsupported") return blocked("unsupported_file");
  if (format === "malformed") return blocked("malformed_file");

  if (format === "csv" || format === "tsv") {
    let text = "";
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
    } catch {
      return blocked("malformed_file", format);
    }
    const parsed = parseProductImportDelimited(text, format === "tsv" ? "\t" : ",");
    return { format, parsed, selectedSheet: null, sheets: [] };
  }

  try {
    const workbook = format === "xlsx"
      ? await readXlsxWorkbook(input.bytes)
      : readSheetJsWorkbook(input.bytes);
    return workbookToImport(workbook, input.sheetName, format);
  } catch {
    return blocked("malformed_file", format);
  }
}

function blocked(code: string, format: ProductImportFormat | null = null, detail?: string): ProductImportFileRead {
  const issue: ProductImportIssue = { code, level: "error", ...(detail ? { detail } : {}) };
  return {
    format,
    parsed: { fileIssues: [issue], rows: [], skippedBlankRows: 0 },
    selectedSheet: null,
    sheets: [],
  };
}

function fileExtension(fileName: string) {
  const base = fileName.trim().toLowerCase().split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot) : "";
}

function sniffProductImportBytes(bytes: Uint8Array) {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const sample = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 65_536))).toString("latin1");
    if (sample.includes("application/vnd.oasis.opendocument.spreadsheet")) return "ods" as const;
    if (sample.includes("xl/workbook") || sample.includes("[Content_Types].xml")) return "xlsx" as const;
    return "zip" as const;
  }
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return "xls" as const;
  }
  if (bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0)) return "binary" as const;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "text" as const;
  } catch {
    return "binary" as const;
  }
}

function agreeFormat(extension: string, sniffed: ReturnType<typeof sniffProductImportBytes>) {
  if (extension === ".csv") return sniffed === "text" ? "csv" as const : sniffed === "binary" ? "malformed" as const : "mismatch" as const;
  if (extension === ".tsv") return sniffed === "text" ? "tsv" as const : sniffed === "binary" ? "malformed" as const : "mismatch" as const;
  if (extension === ".xlsx") return sniffed === "xlsx" ? "xlsx" as const : sniffed === "zip" ? "malformed" as const : "mismatch" as const;
  if (extension === ".ods") return sniffed === "ods" ? "ods" as const : sniffed === "zip" ? "malformed" as const : "mismatch" as const;
  if (extension === ".xls") return sniffed === "xls" ? "xls" as const : "mismatch" as const;
  return "unsupported" as const;
}

async function readXlsxWorkbook(bytes: Uint8Array): Promise<ImportedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  const payload = Buffer.from(bytes);
  await workbook.xlsx.load(payload as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return {
    sheets: workbook.worksheets.map((sheet) => ({
      empty: sheet.actualRowCount === 0,
      name: sheet.name,
      rows: () => excelRows(sheet),
    })),
  };
}

function readSheetJsWorkbook(bytes: Uint8Array): ImportedWorkbook {
  const book = XLSX.read(Buffer.from(bytes), {
    type: "buffer",
    bookFiles: false,
    bookVBA: false,
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
  });
  return {
    sheets: book.SheetNames.map((name) => {
      const sheet = book.Sheets[name];
      const grid = sheet ? sheetJsRows(sheet) : { rows: [], skippedBlankRows: 0, tooMany: false };
      return {
        empty: grid.rows.length === 0,
        name,
        rows: () => grid,
      };
    }),
  };
}

type ImportedSheet = {
  empty: boolean;
  name: string;
  rows: () => { rows: ProductImportGridRow[]; skippedBlankRows: number; tooMany: boolean };
};

type ImportedWorkbook = {
  sheets: ImportedSheet[];
};

function workbookToImport(workbook: ImportedWorkbook, sheetName: string | undefined, format: ProductImportFormat): ProductImportFileRead {
  const sheets = workbook.sheets.map((sheet) => ({ empty: sheet.empty, name: sheet.name }));
  if (sheets.length === 0) return blocked("empty_file", format);
  const selected = sheetName
    ? workbook.sheets.find((sheet) => sheet.name === sheetName)
    : workbook.sheets.find((sheet) => !sheet.empty) ?? workbook.sheets[0];
  if (!selected) return blocked("sheet_not_found", format, sheetName);
  const grid = selected.rows();
  if (grid.tooMany) {
    return {
      format,
      parsed: {
        fileIssues: [{ code: "too_many_rows", detail: String(PRODUCT_IMPORT_MAX_ROWS), level: "error" }],
        rows: [],
        skippedBlankRows: grid.skippedBlankRows,
      },
      selectedSheet: selected.name,
      sheets,
    };
  }
  return {
    format,
    parsed: mapProductImportGrid(grid.rows, grid.skippedBlankRows),
    selectedSheet: selected.name,
    sheets,
  };
}

function excelRows(sheet: ExcelJS.Worksheet) {
  if (sheet.actualRowCount > SCAN_ROW_LIMIT) {
    return { rows: [], skippedBlankRows: 0, tooMany: true };
  }
  const rows: ProductImportGridRow[] = [];
  let skippedBlankRows = 0;
  let previous = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (previous > 0 && rowNumber > previous + 1) skippedBlankRows += rowNumber - previous - 1;
    else if (previous === 0 && rowNumber > 1) skippedBlankRows += rowNumber - 1;
    previous = rowNumber;
    const cells: string[] = [];
    const last = Math.min(row.cellCount, SCAN_COLUMN_LIMIT);
    for (let column = 1; column <= last; column += 1) {
      cells.push(excelCellText(row.getCell(column)));
    }
    if (cells.some((value) => value.trim() !== "")) rows.push({ cells, lineNumber: rowNumber });
    else skippedBlankRows += 1;
  });
  return { rows, skippedBlankRows, tooMany: false };
}

function sheetJsRows(sheet: XLSX.WorkSheet) {
  const ref = sheet["!ref"];
  if (!ref) return { rows: [], skippedBlankRows: 0, tooMany: false };
  const range = XLSX.utils.decode_range(ref);
  if (range.e.r - range.s.r > SCAN_ROW_LIMIT) {
    return { rows: [], skippedBlankRows: 0, tooMany: true };
  }
  const rows: ProductImportGridRow[] = [];
  let skippedBlankRows = 0;
  let previous = range.s.r - 1;
  const lastColumn = Math.min(range.e.c, range.s.c + SCAN_COLUMN_LIMIT - 1);
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const cells: string[] = [];
    for (let column = range.s.c; column <= lastColumn; column += 1) {
      const address = XLSX.utils.encode_cell({ c: column, r: rowIndex });
      cells.push(sheetJsCellText(sheet[address] as XLSX.CellObject | undefined));
    }
    if (cells.some((value) => value.trim() !== "")) {
      if (rowIndex > previous + 1) skippedBlankRows += rowIndex - previous - 1;
      previous = rowIndex;
      rows.push({ cells, lineNumber: rowIndex + 1 });
    }
  }
  return { rows, skippedBlankRows, tooMany: false };
}

function excelCellText(cell: ExcelJS.Cell) {
  return primitiveImportText(unwrapExcelValue(cell.value));
}

function unwrapExcelValue(value: ExcelJS.CellValue): unknown {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) return unwrapExcelValue((value as { result?: ExcelJS.CellValue }).result ?? "");
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? "").join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return "";
  }
  return "";
}

function sheetJsCellText(cell: XLSX.CellObject | undefined) {
  if (!cell || cell.t === "z" || cell.t === "e") return "";
  if (cell.t === "b") return cell.v ? "true" : "false";
  if (cell.t === "d" || cell.v instanceof Date) return primitiveImportText(cell.v);
  const kind = cell.t as string;
  if (kind === "s" || kind === "str") return String(cell.v ?? "");
  if (typeof cell.v === "number") return plainNumber(cell.v);
  if (typeof cell.v === "string") return cell.v;
  return "";
}

function primitiveImportText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return plainNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
}

function plainNumber(value: number) {
  if (!Number.isFinite(value)) return "";
  if (Object.is(value, -0)) return "0";
  if (Number.isSafeInteger(value)) return String(value);
  const text = value.toLocaleString("fullwide", { maximumFractionDigits: 20, useGrouping: false });
  return /e/i.test(text) ? value.toFixed(20).replace(/\.?0+$/, "") : text;
}
