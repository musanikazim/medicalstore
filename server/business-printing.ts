import PDFDocument from "pdfkit";
import { D } from "./core";
export const amountText = (v: any) => D(String(v ?? 0)).toFixed(2);
export function businessDocument(settings: any, title: string, format = "A4") {
  if (!["A4", "80", "58"].includes(format))
    throw new Error("Unsupported print format");
  const a4 = format === "A4",
    width = a4 ? 595.28 : format === "58" ? 164.41 : 226.77,
    margin = a4 ? 32 : 9;
  const pdf = new PDFDocument({
    size: a4 ? "A4" : [width, 14000],
    margin,
    bufferPages: true,
  });
  const content = width - 2 * margin,
    normal = a4 ? 9 : 8;
  pdf.fontSize(normal);
  const pageEnds = new Map<any, number>();
  const ensure = (height: number) => {
    if (pdf.y + height > pdf.page.height - margin - 22) {
      pageEnds.set(pdf.page, pdf.y);
      pdf.addPage();
      pdf.fontSize(normal);
    }
  };
  if (settings.logo) {
    try {
      pdf.image(
        Buffer.from(settings.logo.split(",")[1], "base64"),
        margin,
        pdf.y,
        { fit: [40, 40] },
      );
      pdf.y += 45;
    } catch {}
  }
  pdf
    .font("Helvetica-Bold")
    .fontSize(a4 ? 18 : 11)
    .text(settings.storeName || "Store name not configured", {
      align: "center",
    });
  pdf
    .font("Helvetica")
    .fontSize(normal)
    .text([settings.address, settings.phone].filter(Boolean).join("\n"), {
      align: "center",
    })
    .moveDown();
  pdf.font("Helvetica-Bold").text(title, { align: "center" }).moveDown();
  pdf.font("Helvetica");
  const text = (value: string) => {
    ensure(pdf.heightOfString(value, { width: content }) + 8);
    pdf.text(value, margin, pdf.y, { width: content }).moveDown(0.3);
  };
  const table = (
    headers: string[],
    rows: any[][],
    weights?: number[],
    numeric: number[] = [],
  ) => {
    const ratios = weights || headers.map(() => 1 / headers.length);
    const draw = (values: any[], bold = false) => {
      pdf.font(bold ? "Helvetica-Bold" : "Helvetica");
      if (!a4) {
        text(values.map((v, i) => `${headers[i]}: ${v ?? ""}`).join("\n"));
        return;
      }
      const heights = values.map((v, i) =>
        pdf.heightOfString(String(v ?? ""), { width: content * ratios[i] - 8 }),
      );
      const height = Math.max(...heights, 12) + 10;
      if (height > pdf.page.height - margin * 2 - 30) {
        for (let i = 0; i < values.length; i++)
          text(headers[i] + ": " + String(values[i] ?? ""));
        return;
      }
      const old = pdf.page;
      ensure(height);
      if (old !== pdf.page && !bold) draw(headers, true);
      const y = pdf.y;
      let x = margin;
      values.forEach((v, i) => {
        pdf
          .rect(x, y, content * ratios[i], height)
          .strokeColor("#cccccc")
          .stroke();
        pdf.fillColor("#111111").text(String(v ?? ""), x + 4, y + 5, {
          width: content * ratios[i] - 8,
          align: numeric.includes(i) ? "right" : "left",
        });
        x += content * ratios[i];
      });
      pdf.x = margin;
      pdf.y = y + height;
    };
    if (a4) draw(headers, true);
    for (const row of rows) draw(row);
    pdf.moveDown();
  };
  const finish = () => {
    pageEnds.set(pdf.page, pdf.y);
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      const end = pageEnds.get(pdf.page) ?? pdf.page.height - margin - 30;
      const footerY = a4
        ? pdf.page.height - margin - 12
        : Math.min(end + 12, pdf.page.height - margin - 12);
      pdf
        .fontSize(7)
        .text(`Page ${i + 1} of ${range.count}`, margin, footerY, {
          width: content,
          align: "center",
          lineBreak: false,
        });
      if (!a4) {
        const usedHeight = Math.min(
          pdf.page.height,
          Math.max(120, end + margin + 30),
        );
        // Keep the top edge fixed while cropping the unused bottom of a roll.
        (pdf.page as any).dictionary.data.MediaBox = [
          0,
          pdf.page.height - usedHeight,
          width,
          pdf.page.height,
        ];
      }
    }
    return pdf;
  };
  return { pdf, text, table, finish };
}
export function statementDocument(
  d: any,
  settings: any,
  format: string,
  detailed = false,
) {
  const doc = businessDocument(settings, "CUSTOMER STATEMENT", format);
  doc.text(
    `${d.customer.name}\n${[d.customer.mobile, d.customer.address].filter(Boolean).join(" | ")}`,
  );
  doc.text(
    `Period: ${d.from || "Beginning"} to ${d.to || "Today"}\nGenerated: ${new Date(d.generatedAt).toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}`,
  );
  doc.text(`Opening balance (PKR): ${d.opening}`);
  const headers = [
    "Date",
    "Document No.",
    "Particulars",
    "Debit PKR",
    "Credit PKR",
    "Balance PKR",
  ];
  const weights = [0.14, 0.16, 0.22, 0.16, 0.16, 0.16];
  if (!detailed)
    doc.table(
      headers,
      d.rows.map((r: any) => [
        r.date,
        r.document,
        r.particulars,
        amountText(r.debit),
        amountText(r.credit),
        r.balance,
      ]),
      weights,
      [3, 4, 5],
    );
  else
    for (const r of d.rows) {
      doc.table(
        headers,
        [
          [
            r.date,
            r.document,
            r.particulars,
            amountText(r.debit),
            amountText(r.credit),
            r.balance,
          ],
        ],
        weights,
        [3, 4, 5],
      );
      if (r.remarks) doc.text(r.remarks);
      if (r.returnDetails)
        doc.text(
          `Return against ${r.returnDetails.originalInvoice}: ${r.returnDetails.item}; quantity ${r.returnDetails.quantity}; refund ${amountText(r.returnDetails.refundAmount)}; ${r.returnDetails.reason}`,
        );
      if (r.invoice) {
        const s = r.invoice;
        doc.table(
          ["Item", "Unit", "Qty", "Price", "Discount", "Total"],
          s.lines.map((l: any) => [
            l.name,
            l.unitLabel || l.unit,
            String(l.quantity),
            amountText(l.price),
            amountText(l.discount),
            amountText(l.net),
          ]),
          [0.3, 0.13, 0.1, 0.16, 0.15, 0.16],
          [2, 3, 4, 5],
        );
        doc.text(
          `Invoice total PKR ${amountText(s.total)} | Invoice discount ${amountText(s.discount)} | Tax ${amountText(s.tax)} | Credit at sale ${amountText(s.creditAmount)}`,
        );
      }
    }
  doc.text(
    `Total debit: PKR ${d.debit}\nTotal credit: PKR ${d.credit}\nClosing balance: PKR ${d.closing}`,
  );
  doc.text(
    "Positive balance is receivable; negative balance is customer advance. Invoice items show original transaction values.",
  );
  return doc.finish();
}
