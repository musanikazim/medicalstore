/** RFC-style CSV including quoted commas, escaped quotes and multiline remarks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (!quoted && field.length)
        throw new Error("CSV quote inside an unquoted field");
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quote");
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  if (!rows.length) throw new Error("CSV is empty");
  const headers = rows[0].map((h) => h.trim());
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error("Column headings must be nonempty and unique");
  for (const r of rows.slice(1))
    if (r.length > headers.length)
      throw new Error("CSV row has more fields than its headings");
  rows[0] = headers;
  return rows;
}
