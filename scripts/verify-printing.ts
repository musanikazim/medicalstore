import { mkdir, writeFile, readFile } from "node:fs/promises";
import { statementDocument } from "../server/business-printing";
const dir = ".cache/validation/printing";
await mkdir(dir, { recursive: true });
const settings = {
  storeName: "Al-Madina Medical & General Store",
  address: "Main Market, Karachi",
  phone: "0300 1234567",
  logo:
    "data:image/png;base64," +
    (await readFile("tests/fixtures/store-logo.png")).toString("base64"),
};
const rows = Array.from({ length: 12 }, (_, i) => ({
  date: "2026-11-03",
  document: "INV-" + (i + 1),
  particulars: "Credit sale",
  debit: "365.00",
  credit: "0.00",
  balance: String(1000 + (i + 1) * 365),
  invoice: {
    total: "365",
    discount: "0",
    tax: "0",
    creditAmount: "365",
    lines: [
      {
        name: "Panadol 500mg - long medicine description for wrapping verification",
        unitLabel: "Strip",
        quantity: 2,
        price: "120",
        discount: "0",
        net: "240",
      },
      {
        name: "Syringe 5ml sterile disposable",
        unitLabel: "Piece",
        quantity: 5,
        price: "25",
        discount: "0",
        net: "125",
      },
    ],
  },
}));
const d = {
  customer: { name: "Ahmed Khan", mobile: "03001234567", address: "Karachi" },
  from: "2026-11-01",
  to: "2026-11-03",
  generatedAt: new Date("2026-11-03T07:00:00Z"),
  opening: "1000.00",
  debit: "4380.00",
  credit: "0.00",
  closing: "5380.00",
  rows,
};
for (const paper of ["A4", "80", "58"]) {
  const pdf = statementDocument(d, settings, paper, true);
  const chunks: Buffer[] = [];
  const end = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (b) => chunks.push(b));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  pdf.end();
  await writeFile(`${dir}/statement-${paper}.pdf`, await end);
}
console.log(
  "Generated A4, 80mm and 58mm detailed statement fixtures with 12 invoices each.",
);
