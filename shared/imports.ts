import { normalizeName, mobileNumber } from "./business";
export const importFields: Record<string, string[]> = {
  catalogue: [
    "name",
    "category",
    "generic",
    "manufacturer",
    "form",
    "strength",
    "brand",
    "barcode",
    "purchasePrice",
    "salePrice",
    "mrp",
    "baseUnit",
    "purchaseUnit",
    "sellingUnit",
    "unitsPerStrip",
    "stripsPerBox",
    "minimumStock",
    "reorderLevel",
    "reorderQuantity",
    "batchNumber",
    "expiry",
    "quantity",
    "supplier",
    "packagingType",
  ],
  customers: ["name", "mobile", "address", "email", "openingBalance", "notes"],
  suppliers: [
    "name",
    "contactPerson",
    "phone",
    "address",
    "email",
    "openingBalance",
    "remarks",
  ],
  "customer-balances": [
    "name",
    "mobile",
    "openingBalance",
    "date",
    "reference",
  ],
  "supplier-balances": ["name", "openingBalance", "date", "reference"],
  stock: [
    "medicineId",
    "code",
    "name",
    "batchNumber",
    "expiry",
    "quantity",
    "unit",
    "unitCost",
    "salePrice",
    "supplier",
    "date",
    "reference",
  ],
  purchases: [
    "supplier",
    "reference",
    "date",
    "name",
    "medicineId",
    "batchNumber",
    "expiry",
    "quantity",
    "unit",
    "unitCost",
    "discount",
    "tax",
    "total",
    "salePrice",
  ],
  sales: [
    "customer",
    "reference",
    "date",
    "name",
    "quantity",
    "unit",
    "salePrice",
    "discount",
    "tax",
    "total",
  ],
};
export const importLabels: Record<string, string> = {
  name: "Medicine / Customer / Supplier Name",
  category: "Category",
  mobile: "Contact Number",
  phone: "Mobile Number",
  salePrice: "Selling Price",
  unitCost: "Purchase Cost",
  openingBalance: "Opening Outstanding / Payable",
  reorderQuantity: "Target Stock",
  reorderLevel: "Reorder Level",
};
const aliases: Record<string, string[]> = {
  name: [
    "medicine name",
    "customer name",
    "supplier name",
    "product",
    "medicine",
    "item",
  ],
  category: ["type"],
  mobile: ["contact number", "phone", "mobile number"],
  phone: ["mobile number", "contact number"],
  salePrice: ["selling price", "retail"],
  unitCost: ["purchase cost", "purchase price", "rate"],
  purchasePrice: ["purchase price"],
  quantity: ["qty", "available quantity"],
  expiry: ["exp", "expiry date"],
  reference: ["invoice number", "original invoice number", "document no"],
  date: ["purchase date", "opening date"],
  batchNumber: ["batch", "batch number"],
  baseUnit: ["unit"],
  form: ["dosage form"],
  code: ["product code"],
  total: ["invoice total"],
  reorderQuantity: ["target stock"],
  openingBalance: [
    "opening outstanding",
    "opening payable balance",
    "opening outstanding balance",
  ],
};
export function suggestMapping(headers: string[], kind: string) {
  return Object.fromEntries(
    headers.map((h) => [
      h,
      importFields[kind]?.find(
        (f) =>
          normalizeName(h) === normalizeName(f) ||
          normalizeName(h) === normalizeName(f.replace(/([A-Z])/g, " $1")) ||
          aliases[f]?.includes(normalizeName(h)),
      ) || "",
    ]),
  );
}
const numeric = new Set([
  "purchasePrice",
  "salePrice",
  "mrp",
  "unitCost",
  "quantity",
  "minimumStock",
  "reorderLevel",
  "reorderQuantity",
  "unitsPerStrip",
  "stripsPerBox",
  "openingBalance",
  "discount",
  "tax",
  "total",
]);
export function normalizeImportRow(
  row: Record<string, any>,
  kind: string,
  country = "92",
) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined || String(value).trim() === "")
      continue;
    if (!importFields[kind]?.includes(key)) continue;
    let v: any = typeof value === "string" ? value.trim() : value;
    if (numeric.has(key)) {
      const raw = String(v).replace(/,/g, "");
      if (!/^\d+(\.\d{1,6})?$/.test(raw) || Number(raw) > 1e9)
        throw new Error(`${key}: invalid nonnegative number`);
      v = Number(raw);
      if (key === "openingBalance" && !/^\d+(\.\d{1,2})?$/.test(raw))
        throw new Error("Opening balances must use at most two decimal places");
    }
    if (key === "date" || key === "expiry") {
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      if (typeof v === "number") {
        const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
        v = d.toISOString().slice(0, 10);
      }
      if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(String(v))) {
        const [d, m, y] = String(v).split(/[-/]/);
        v = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      if (key === "expiry" && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v))) {
        const [y, m] = v.split("-").map(Number);
        v = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      }
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ||
        isNaN(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v
      )
        throw new Error(`${key}: use YYYY-MM-DD or DD/MM/YYYY`);
    }
    if (typeof v === "string" && v.length > 2000)
      throw new Error(`${key}: maximum length is 2000`);
    if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      throw new Error("Invalid email address");
    out[key] = numeric.has(key) ? v : String(v);
  }
  const required =
    kind === "catalogue"
      ? ["name", "category"]
      : kind === "customers"
        ? ["name", "mobile"]
        : kind === "suppliers"
          ? ["name"]
          : kind.endsWith("balances")
            ? ["name", "openingBalance", "date", "reference"]
            : kind === "stock"
              ? ["quantity", "unit", "unitCost", "date", "reference"]
              : ["reference", "date", "quantity", "unit", "total"];
  for (const key of required)
    if (out[key] === undefined || out[key] === "")
      throw new Error(`${key} is required`);
  if (
    ["stock", "purchases"].includes(kind) &&
    !out.name &&
    !out.medicineId &&
    !out.code
  )
    throw new Error("Product name or code is required");
  if (out.mobile) {
    const n = mobileNumber(out.mobile, country);
    if (!n) throw new Error("Invalid customer mobile number");
    out.mobile = n;
  }
  if (out.phone) {
    const n = mobileNumber(out.phone, country);
    if (!n) throw new Error("Invalid supplier mobile number");
    out.phone = n;
  }
  if (kind === "purchases" && !out.supplier)
    throw new Error("Supplier is required");
  if (["stock", "purchases", "sales"].includes(kind) && !(out.quantity > 0))
    throw new Error("Quantity must be positive");
  for (const k of [
    "minimumStock",
    "reorderLevel",
    "reorderQuantity",
    "unitsPerStrip",
    "stripsPerBox",
  ])
    if (
      out[k] !== undefined &&
      (!Number.isInteger(out[k]) ||
        (["reorderQuantity", "unitsPerStrip", "stripsPerBox"].includes(k) &&
          out[k] < 1))
    )
      throw new Error(`${k}: positive whole units required`);
  return out;
}
