import ExcelJS from "exceljs";
import { EGO_TEMPLATE_HEADERS } from "@/features/products/product-import-methods";

export async function buildEgoTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EGO POS";
  const sheet = workbook.addWorksheet("Products");
  sheet.addRow([...EGO_TEMPLATE_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getColumn(4).numFmt = "@";
  sheet.getColumn(5).numFmt = "@";
  sheet.getColumn(8).numFmt = "#,##0";
  sheet.getColumn(9).numFmt = "#,##0.00";
  sheet.getColumn(10).numFmt = "#,##0.00";
  for (let column = 1; column <= EGO_TEMPLATE_HEADERS.length; column += 1) sheet.getColumn(column).width = 18;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
