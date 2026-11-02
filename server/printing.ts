import PDFDocument from "pdfkit";
import { D, money } from "./core";
const pkr = (v: any) => "PKR " + money(D(String(v))).toFixed(2);
export function invoiceDocument(sale: any, settings: any, format: string) {
  const a4 = format === "A4",
    width = a4 ? 595.28 : format === "58" ? 164.41 : 226.77,
    margin = a4 ? 36 : 10,
    content = width - margin * 2;
  const pdf = new PDFDocument({
    size: a4
      ? "A4"
      : [
          width,
          Math.max(
            500,
            Math.min(
              14000,
              450 +
                sale.lines.reduce(
                  (n: number, l: any) =>
                    n + 70 + Math.ceil(l.name.length / 24) * 10,
                  0,
                ),
            ),
          ),
        ],
    margin,
    bufferPages: true,
  });
  const normal = a4 ? 9 : 8,
    small = a4 ? 8 : 7;
  pdf.font("Helvetica").fontSize(normal);
  const ensure = (h: number) => {
    if (pdf.y + h > pdf.page.height - margin - 25) {
      pdf.addPage();
      pdf.font("Helvetica").fontSize(normal);
    }
  };
  if (settings.logo) {
    try {
      pdf.image(
        Buffer.from(settings.logo.split(",")[1], "base64"),
        (width - 36) / 2,
        pdf.y,
        { fit: [36, 36] },
      );
      pdf.y += 42;
    } catch {}
  }
  pdf
    .font("Helvetica-Bold")
    .fontSize(a4 ? 18 : 12)
    .text(settings.storeName || "Sehat Medical Store", { align: "center" });
  pdf
    .font("Helvetica")
    .fontSize(small)
    .text(
      [settings.address, settings.phone, settings.licence]
        .filter(Boolean)
        .join("\n"),
      { align: "center" },
    )
    .moveDown();
  pdf
    .font("Helvetica-Bold")
    .fontSize(normal)
    .text("SALES INVOICE", { align: "center" })
    .moveDown(0.5);
  pdf
    .font("Helvetica")
    .text(
      `${sale.invoicePrefix || settings.invoicePrefix || "MS"}-${String(sale.number).padStart(5, "0")}`,
    )
    .text(sale.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" }))
    .text("Cashier: " + (sale.cashierName || sale.createdBy))
    .text("Customer: " + (sale.customerName || "Walk-in"))
    .moveDown();
  const rule = () => {
    pdf
      .moveTo(margin, pdf.y)
      .lineTo(width - margin, pdf.y)
      .strokeColor("#cccccc")
      .stroke();
    pdf.y += 6;
  };
  const columns = [
    { name: "# / Product", x: 0, w: 0.4 },
    { name: "Qty / Unit", x: 0.4, w: 0.15 },
    { name: "Price", x: 0.55, w: 0.15 },
    { name: "Discount", x: 0.7, w: 0.14 },
    { name: "Total", x: 0.84, w: 0.16 },
  ];
  const heading = () => {
    rule();
    if (a4) {
      const y = pdf.y;
      pdf.font("Helvetica-Bold");
      for (const c of columns)
        pdf.text(c.name, margin + content * c.x, y, {
          width: content * c.w,
          align: c.x >= 0.55 ? "right" : "left",
        });
      pdf.y = y + 18;
    } else
      pdf
        .font("Helvetica-Bold")
        .text("Product / Qty / Unit / Price / Discount / Total");
    pdf.font("Helvetica");
    rule();
  };
  heading();
  sale.lines.forEach((l: any, i: number) => {
    const unit = l.unitLabel || l.unit;
    const description = `${i + 1}. ${l.name}`;
    if (a4) {
      const h = Math.max(
        28,
        pdf.heightOfString(description, { width: content * 0.4 }) + 10,
      );
      const page = pdf.page;
      ensure(h + 35);
      if (page !== pdf.page) heading();
      const y = pdf.y;
      const values = [
        description,
        `${l.quantity} ${unit}`,
        money(l.price.toString()).toFixed(2),
        money(l.discount.toString()).toFixed(2),
        money(l.net.toString()).toFixed(2),
      ];
      columns.forEach((c, j) =>
        pdf.text(values[j], margin + content * c.x, y, {
          width: content * c.w - 3,
          align: j >= 2 ? "right" : "left",
        }),
      );
      pdf.x = margin;
      pdf.y = y + h;
    } else {
      ensure(65);
      pdf.font("Helvetica-Bold").text(description);
      pdf
        .font("Helvetica")
        .text(`${l.quantity} ${unit} x ${pkr(l.price)}`)
        .text(`Discount ${pkr(l.discount)}`, { align: "left" })
        .text(pkr(l.net), { align: "right" });
    }
    if (settings.showBatch && l.allocations) {
      pdf
        .fontSize(small)
        .text(
          "Batch: " +
            l.allocations
              .map((a: any) => a.batch?.number || a.batchId)
              .join(", "),
        );
      pdf.fontSize(normal);
    }
    rule();
  });
  ensure(200);
  const row = (label: string, value: any, bold = false) => {
    pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(normal);
    const y = pdf.y;
    pdf.text(label, margin, y, { width: content * 0.55 });
    pdf.text(pkr(value), margin + content * 0.55, y, {
      width: content * 0.45,
      align: "right",
    });
    pdf.x = margin;
    pdf.y = Math.max(pdf.y, y + 14);
  };
  const gross = sale.lines.reduce(
    (s: any, l: any) =>
      s.plus(D(l.price.toString()).mul(l.quantity.toString())),
    D(0),
  );
  const lineDiscount = sale.lines.reduce(
    (s: any, l: any) => s.plus(l.discount.toString()),
    D(0),
  );
  row("Subtotal", gross);
  row("Discount", lineDiscount);
  row("Tax", sale.tax || 0);
  row("Grand Total", sale.total, true);
  const credit = sale.creditAccount
    ? D(sale.creditAccount.original.toString())
        .minus(sale.creditAccount.settled.toString())
        .minus(sale.creditAccount.returned.toString())
    : D(sale.creditAmount?.toString() || 0);
  row(
    "Paid at sale",
    D(sale.total.toString()).minus(sale.creditAmount?.toString() || 0),
  );
  row("Invoice outstanding", credit, true);
  const change = sale.payments.reduce(
    (s: any, p: any) =>
      s.plus(
        p.method === "CASH"
          ? D(p.tendered.toString()).minus(p.amount.toString())
          : 0,
      ),
    D(0),
  );
  if (change.gt(0)) row("Change returned", change);
  for (const payment of sale.payments) {
    ensure(28);
    pdf
      .font("Helvetica")
      .fontSize(small)
      .text(
        `${payment.method}: ${pkr(payment.amount)}${payment.reference ? " | " + payment.reference : ""}${payment.cardLastFour ? " | **** " + payment.cardLastFour : ""}`,
      );
  }
  pdf.moveDown();
  for (const value of [
    settings.footer || "Thank you. Please retain your receipt.",
    settings.returnPolicy,
    settings.storeNotes,
  ])
    if (value) {
      ensure(pdf.heightOfString(value) + 10);
      pdf
        .font("Helvetica")
        .fontSize(small)
        .text(value, { align: "center" })
        .moveDown(0.5);
    }
  if (a4) {
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      pdf
        .fontSize(8)
        .text(`Page ${i + 1} of ${range.count}`, margin, pdf.page.height - 25, {
          width: content,
          align: "center",
          lineBreak: false,
        });
    }
  }
  return pdf;
}
export function collectionDocument(c: any, customer: any, settings: any) {
  const pdf = new PDFDocument({ size: "A4", margin: 45 });
  pdf
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(settings.storeName || "Sehat Medical Store");
  pdf
    .font("Helvetica")
    .fontSize(10)
    .text(settings.address || "")
    .text(settings.phone || "")
    .moveDown()
    .fontSize(14)
    .text("PAYMENT RECEIPT RC-" + c.number)
    .fontSize(10)
    .text("Customer: " + customer.name)
    .text("Date: " + c.paymentDate)
    .text("Amount: " + pkr(c.amount))
    .text("Method: " + c.method)
    .text("Reference: " + (c.reference || "—"))
    .text("Customer advance: " + pkr(c.advance))
    .text("Opening balance allocation: " + pkr(c.openingAllocation))
    .text("Entered by: " + c.createdBy)
    .text("Remarks: " + c.remarks);
  if (c.reversal) pdf.moveDown().text("REVERSED: " + c.reversal.reason);
  return pdf;
}
