export async function readSheet(file: File): Promise<Record<string, any>[]> {
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Import files must be 2 MB or smaller");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(Boolean);
    const parse = (line: string) => {
      const values: string[] = [];
      let field = "",
        quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') {
            field += '"';
            i++;
          } else quoted = !quoted;
        } else if (ch === "," && !quoted) {
          values.push(field);
          field = "";
        } else field += ch;
      }
      if (quoted)
        throw new Error(
          "CSV contains an unclosed quote; use XLSX for multiline fields",
        );
      values.push(field);
      return values;
    };
    if (lines.length < 2) throw new Error("No import rows");
    const headers = parse(lines[0]);
    return lines
      .slice(1)
      .map((line) =>
        Object.fromEntries(
          parse(line).map((v, i) => [headers[i], coerce(headers[i], v)]),
        ),
      );
  }
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error("Workbook is empty");
  const headers = (sheet.getRow(1).values as any[]).slice(1);
  const out: Record<string, any>[] = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const obj: Record<string, any> = {};
    headers.forEach((key, j) => {
      const v = row.getCell(j + 1).value;
      if (v !== null)
        obj[String(key)] = coerce(
          String(key),
          v instanceof Date
            ? v.toISOString().slice(0, 10)
            : typeof v === "object"
              ? String((v as any).text || "")
              : v,
        );
    });
    out.push(obj);
  });
  return out;
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
