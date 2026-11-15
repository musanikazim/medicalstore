import { parseCsv } from "../shared/csv";
export async function readSheet(
  file: File,
  worksheet = 0,
  raw = false,
): Promise<Record<string, any>[]> {
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Import files must be 2 MB or smaller");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  if (file.name.toLowerCase().endsWith(".csv")) {
    const records = parseCsv(await file.text()),
      headers = records[0];
    if (records.length < 2) throw new Error("No import rows");
    return records
      .slice(1)
      .map((row) =>
        Object.fromEntries(
          headers.map((h, i) => [
            h,
            raw ? (row[i] ?? "") : coerce(h, row[i] ?? ""),
          ]),
        ),
      );
  }
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.worksheets[worksheet];
  if (!sheet) throw new Error("Workbook is empty");
  const headers = (sheet.getRow(1).values as any[])
    .slice(1)
    .map((h) => String(h ?? "").trim());
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error("Column headings must be nonempty and unique");
  const out: Record<string, any>[] = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const obj: Record<string, any> = {};
    headers.forEach((key, j) => {
      const v = row.getCell(j + 1).value;
      if (v !== null)
        obj[String(key)] = (raw ? (_k: string, v: any) => v : coerce)(
          String(key),
          v instanceof Date
            ? v.toISOString().slice(0, 10)
            : typeof v === "object"
              ? String((v as any).text || "")
              : v,
        );
    });
    if (Object.values(obj).some((v) => v !== "")) out.push(obj);
  });
  return out;
}
export async function worksheetNames(file: File) {
  if (file.name.toLowerCase().endsWith(".csv")) return ["CSV"];
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Import files must be 2 MB or smaller");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  return book.worksheets.map((s) => s.name);
}
function coerce(key: string, value: any) {
  const numeric = [
    "unitsPerStrip",
    "stripsPerBox",
    "purchasePrice",
    "salePrice",
    "stripPrice",
    "boxPrice",
    "mrp",
    "minimumStock",
    "reorderQuantity",
    "quantity",
    "unitCost",
  ];
  if (["active", "looseAllowed", "prescription"].includes(key))
    return String(value).toLowerCase() === "true";
  if (numeric.includes(key)) return value === "" ? null : Number(value);
  return String(value);
}
export async function exportSheet(
  rows: Record<string, any>[],
  filename: string,
) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Medicines");
  if (rows.length) {
    sheet.columns = Object.keys(rows[0]).map((k) => ({
      header: k,
      key: k,
      width: 20,
    }));
    for (const row of rows) sheet.addRow(row);
  }
  const blob = new Blob([(await book.xlsx.writeBuffer()) as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
