import { db, D } from "./core";
import { businessReference, ledgerLabels } from "../shared/business";
import { businessDate } from "../shared/expiry";
export async function statement(customerId: string, from = "", to = "") {
  for (const d of [from, to])
    if (
      d &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(d) ||
        isNaN(Date.parse(d)) ||
        new Date(d).toISOString().slice(0, 10) !== d)
    )
      throw new Error("Invalid statement date");
  if (from && to && from > to)
    throw new Error("From date must precede To date");
  return db.$transaction(
    async (t) => {
      const customer = await t.customer.findUniqueOrThrow({
        where: { id: customerId },
      });
      const entries = await t.customerLedger.findMany({
        where: { customerId },
        orderBy: { sequence: "asc" },
      });
      const storedSales = await t.sale.findMany({
        where: { customerId },
        include: {
          lines: { include: { allocations: { select: { id: true } } } },
        },
      });
      // Public statements never expose internal purchase costs, profit or operator IDs.
      const sales = storedSales.map(({ cogs, createdBy, ...s }) => ({
        ...s,
        lines: s.lines.map(({ cogs, ...l }) => l),
      }));
      const collections = await t.collection.findMany({
        where: { customerId },
      });
      const returns = await t.returnRecord.findMany({ where: { customerId } });
      let opening = D(0),
        debit = D(0),
        credit = D(0);
      const rows: any[] = [];
      // Sequence preserves the original posting order; use original payment business dates for filtering.
      for (const e of entries) {
        const receipt = collections.find((c) => c.id === e.collectionId);
        const sale = sales.find((s) => s.id === e.saleId);
        const returned = returns.find((r) => r.id === e.reference);
        const original = returned
          ? sales.find(
              (s) =>
                s.lines.some((l) =>
                  l.allocations.some((al) => al.id === returned.originalId),
                ) || s.id === returned.originalId,
            )
          : undefined;
        const date =
          receipt && ["PAYMENT", "COLLECTION", "ADVANCE"].includes(e.type)
            ? receipt.paymentDate
            : businessDate(e.createdAt);
        if (from && date < from) {
          opening = opening.plus(e.debit.toString()).minus(e.credit.toString());
          continue;
        }
        if (to && date > to) continue;
        debit = debit.plus(e.debit.toString());
        credit = credit.plus(e.credit.toString());
        rows.push({
          ...e,
          date,
          particulars:
            ledgerLabels[e.type] || e.type.replaceAll("_", " ").toLowerCase(),
          document: sale
            ? `${sale.invoicePrefix || "MS"}-${sale.number}`
            : receipt
              ? `RC-${receipt.number}`
              : (e.type === "CREDIT_NOTE"
                  ? "CN-" + e.sequence
                  : businessReference(e.reference)) ||
                (e.type === "OPENING" ? "Opening" : "Adjustment"),
          remarks: businessReference(e.remarks),
          invoice: sale || original || null,
          returnDetails: returned
            ? {
                quantity: returned.quantity,
                refundAmount: returned.refundAmount,
                reason: returned.reason,
                originalInvoice: original
                  ? `${original.invoicePrefix || "MS"}-${original.number}`
                  : "",
                item:
                  original?.lines.find((l) =>
                    l.allocations.some((al) => al.id === returned.originalId),
                  )?.name || "",
              }
            : null,
        });
      }
      rows.sort(
        (a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence,
      );
      let running = opening;
      for (const r of rows) {
        running = running.plus(r.debit.toString()).minus(r.credit.toString());
        r.balance = running.toFixed(2);
      }
      return {
        customer,
        from,
        to,
        generatedAt: new Date(),
        opening: opening.toFixed(2),
        debit: debit.toFixed(2),
        credit: credit.toFixed(2),
        closing: running.toFixed(2),
        rows,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
