import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLargeImportPreview } from "../features/products/product-import-preview";
import { readWorkbookPreviewSource } from "../features/products/product-import-preview-sheet";

const targetBytes = 10 * 1024 * 1024;
const rows: string[] = ['<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Product Name</t></is></c><c r="B1" t="inlineStr"><is><t>SKU</t></is></c><c r="C1" t="inlineStr"><is><t>Barcode</t></is></c></row>'];
let bytes = Buffer.byteLength(rows[0] ?? "");
let count = 0;
while (bytes < targetBytes) {
  count += 1;
  const row = `<row r="${count + 1}"><c r="A${count + 1}" t="inlineStr"><is><t>Synthetic ${count}</t></is></c><c r="B${count + 1}" t="inlineStr"><is><t>SKU-${count}</t></is></c><c r="C${count + 1}"><v>${1_000_000_000_000 + count}</v></c></row>`;
  rows.push(row);
  bytes += Buffer.byteLength(row);
}
rows.push("</sheetData></worksheet>");
const sheet = Buffer.from(rows.join(""));
const workbook = Buffer.from('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheet name="Synthetic" r:id="rId1"/></workbook>');
const rels = Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
const directory = await mkdtemp(join(tmpdir(), "ego-preview-bench-"));
const filePath = join(directory, "synthetic.xlsx");
await writeFile(filePath, storedZip([
  { data: workbook, name: "xl/workbook.xml" },
  { data: rels, name: "xl/_rels/workbook.xml.rels" },
  { data: sheet, name: "xl/worksheets/sheet1.xml" },
]));
const started = performance.now();
const source = await readWorkbookPreviewSource(filePath, "Synthetic");
const preview = buildLargeImportPreview({ catalog: [], pageSize: 20, rows: source.rows, sheetName: source.sheetName });
const elapsed = Math.round(performance.now() - started);
const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
console.log(JSON.stringify({
  elapsedMs: elapsed,
  fileMb: Number((sheet.length / 1024 / 1024).toFixed(2)),
  heapMb,
  pageRows: preview.excel.rows.length,
  sheetRows: source.rows.length - 1,
  status: "synthetic",
}));
await rm(directory, { force: true, recursive: true });

function storedZip(entries: Array<{ data: Buffer; name: string }>) {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, entry.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += 30 + name.length + entry.data.length;
  }
  const directoryBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directoryBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directoryBytes, eocd]);
}
