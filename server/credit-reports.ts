import { db, D, today, requireRole, managers, type Actor } from "./core";
import { z } from "zod";
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Reconstruct an as-of balance from immutable entries rather than today's projections.
async function historicalBalance(t: any, c: any, end: Date) {
  const [entries, collections, notes] = await Promise.all([
    t.customerLedger.findMany({
      where: { customerId: c.id, createdAt: { lte: end } },
      orderBy: { sequence: "asc" },
    }),
    t.collection.findMany({
      where: { customerId: c.id },
      include: { settlements: true },
    }),
    t.settlement.findMany({
      where: {
        kind: "CREDIT_NOTE",
        createdAt: { lte: end },
        account: { customerId: c.id },
      },
    }),
  ]);
  let opening = D(0),
    advance = D(0),
    net = D(0);
  const accounts = new Map<string, ReturnType<typeof D>>();
  const apply = (id: string, amount: any) =>
    accounts.set(id, (accounts.get(id) || D(0)).plus(amount));
  for (const e of entries) {
    const debit = D(e.debit.toString()),
      credit = D(e.credit.toString());
    net = net.plus(debit).minus(credit);
    if (e.type === "OPENING") opening = opening.plus(debit);
    else if (e.type === "CREDIT_SALE") apply(e.saleId, debit);
    else if (e.type === "SALE_RETURN") apply(e.saleId, credit.neg());
    else if (e.type === "ADVANCE" || e.type === "RETURN_ADVANCE")
      advance = advance.plus(credit);
    else if (e.type === "ADVANCE_APPLIED") advance = advance.minus(debit);
    else if (e.type === "PAYMENT") {
      const payment = collections.find((x: any) => x.id === e.collectionId);
      if (!payment) throw new Error("Collection reference unavailable");
      opening = opening.minus(payment.openingAllocation.toString());
      for (const x of payment.settlements)
        apply(x.saleId, D(x.amount.toString()).neg());
    } else if (e.type === "PAYMENT_REVERSAL") {
      const payment = collections.find((x: any) => x.id === e.collectionId);
      if (!payment) throw new Error("Reversal reference unavailable");
      opening = opening.plus(payment.openingAllocation.toString());
      advance = advance.minus(payment.advance.toString());
      for (const x of payment.settlements) apply(x.saleId, x.amount.toString());
    } else if (e.type === "CREDIT_NOTE") {
      let remainder = credit;
      for (const x of notes.filter((x: any) => x.reference === e.reference)) {
        const amount = D(x.amount.toString());
        apply(x.saleId, amount.neg());
        remainder = remainder.minus(amount);
      }
      const againstOpening = opening.lt(remainder) ? opening : remainder;
      opening = opening.minus(againstOpening);
      advance = advance.plus(remainder.minus(againstOpening));
    }
  }
  const due = [...accounts.values()].reduce((s, x) => s.plus(x), opening);
  if (
    !due.minus(advance).eq(net) ||
    opening.lt(0) ||
    advance.lt(0) ||
    [...accounts.values()].some((x) => x.lt(0))
  )
    throw new Error("Customer historical balance does not reconcile");
  return { opening, advance, accounts, outstanding: due, net };
}
export async function creditReport(a: Actor, query: any) {
  requireRole(a, managers);
  const from = iso.parse(query.from || "2000-01-01"),
    to = iso.parse(query.to || today());
  if (from > to) throw new Error("Start date must precede end date");
  const kind = z
    .enum([
      "outstanding",
      "statement",
      "credit-sales",
      "collections",
      "overdue",
      "customer-sales",
      "aging",
      "reconciliation",
    ])
    .parse(query.kind || "outstanding");
  const customerId = query.customerId ? String(query.customerId) : undefined;
  const dates = {
    gte: new Date(from + "T00:00:00+05:00"),
    lte: new Date(to + "T23:59:59.999+05:00"),
  };
  return db.$transaction(
    async (t) => {
      const customers = await t.customer.findMany({
        where: customerId ? { id: customerId } : {},
        include: { accounts: { include: { sale: true } } },
        orderBy: { name: "asc" },
      });
      const rows: any[] = [];
      if (["outstanding", "overdue", "aging"].includes(kind))
        for (const c of customers) {
          if (c.createdAt > dates.lte) continue;
          const history = await historicalBalance(t, c, dates.lte);
          const opening = history.opening;
          const accounts = c.accounts
            .filter((x) => history.accounts.has(x.saleId))
            .map((x) => ({ ...x, due: history.accounts.get(x.saleId)! }));
          const outstanding = accounts.reduce((s, x) => s.plus(x.due), opening);
          const buckets = [D(0), D(0), D(0), opening];
          let overdue = opening;
          for (const x of accounts) {
            const age = Math.floor(
              (Date.parse(to) - Date.parse(x.dueDate)) / 86400000,
            );
            if (age > 0) overdue = overdue.plus(x.due);
            buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] =
              buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3].plus(
                x.due,
              );
          }
          if (kind === "overdue" && overdue.lte(0)) continue;
          rows.push({
            customerId: c.id,
            customer: c.name,
            mobile: c.mobile,
            outstanding: outstanding.toFixed(2),
            advance: history.advance.toFixed(2),
            netBalance: outstanding.minus(history.advance).toFixed(2),
            overdue: overdue.toFixed(2),
            "0–30": buckets[0].toFixed(2),
            "31–60": buckets[1].toFixed(2),
            "61–90": buckets[2].toFixed(2),
            "90+ / opening": buckets[3].toFixed(2),
          });
        }
      if (kind === "statement")
        for (const c of customers) {
          const ledger = await t.customerLedger.findMany({
            where: { customerId: c.id, createdAt: { lte: dates.lte } },
            orderBy: { sequence: "asc" },
          });
          let running = D(0);
          for (const l of ledger) {
            running = running
              .plus(l.debit.toString())
              .minus(l.credit.toString());
            if (l.createdAt >= dates.gte)
              rows.push({
                customer: c.name,
                date: l.createdAt.toISOString(),
                type: l.type,
                reference: l.reference,
                debit: l.debit.toFixed(2),
                credit: l.credit.toFixed(2),
                balance: running.toFixed(2),
                remarks: l.remarks,
                enteredBy: l.createdBy,
              });
          }
        }
      const sales = await t.sale.findMany({
        where: { createdAt: dates, ...(customerId ? { customerId } : {}) },
        include: { payments: true },
      });
      const collections = await t.collection.findMany({
        where: { createdAt: dates, ...(customerId ? { customerId } : {}) },
        include: { customer: true, reversal: true },
      });
      if (kind === "credit-sales")
        for (const s of sales.filter((s) => s.creditAmount.gt(0)))
          rows.push({
            invoice: (s.invoicePrefix || "MS") + "-" + s.number,
            date: s.createdAt.toISOString(),
            customer: s.customerName,
            total: s.total.toFixed(2),
            credit: s.creditAmount.toFixed(2),
            dueDate: s.dueDate,
          });
      if (kind === "collections")
        for (const c of collections)
          rows.push({
            receipt: "RC-" + c.number,
            date: c.paymentDate,
            posted: c.createdAt.toISOString(),
            customer: c.customer.name,
            amount: c.amount.toFixed(2),
            method: c.method,
            reference: c.reference,
            advance: c.advance.toFixed(2),
            status:
              c.reversal && c.reversal.createdAt <= dates.lte
                ? "REVERSED"
                : "POSTED",
          });
      const returns = await t.returnRecord.findMany({
        where: {
          type: "SALE",
          createdAt: dates,
          ...(customerId ? { customerId } : {}),
        },
      });
      if (kind === "customer-sales") {
        const grouped = new Map<string, any>();
        for (const s of sales) {
          const key = s.customerId || "walk-in";
          const row = grouped.get(key) || {
            customer: s.customerName || "Walk-in",
            invoices: 0,
            gross: D(0),
            returns: D(0),
            credit: D(0),
          };
          row.invoices++;
          row.gross = row.gross
            .plus(s.total.toString())
            .minus(s.tax.toString());
          row.credit = row.credit.plus(s.creditAmount.toString());
          grouped.set(key, row);
        }
        for (const r of returns) {
          const key = r.customerId || "walk-in";
          const row = grouped.get(key) || {
            customer: customers.find((c) => c.id === key)?.name || "Walk-in",
            invoices: 0,
            gross: D(0),
            returns: D(0),
            credit: D(0),
          };
          row.returns = row.returns
            .plus(r.amount.toString())
            .minus(r.tax.toString());
          grouped.set(key, row);
        }
        for (const x of grouped.values())
          rows.push({
            customer: x.customer,
            invoices: x.invoices,
            salesExTax: x.gross.toFixed(2),
            returnsExTax: x.returns.toFixed(2),
            netRevenue: x.gross.minus(x.returns).toFixed(2),
            creditAtSale: x.credit.toFixed(2),
          });
      }
      if (kind === "reconciliation") {
        const methods = new Map<string, any>();
        const method = (k: string) => {
          if (!methods.has(k))
            methods.set(k, {
              method: k,
              sales: D(0),
              collections: D(0),
              reversals: D(0),
              refunds: D(0),
            });
          return methods.get(k);
        };
        for (const s of sales)
          for (const p of s.payments) {
            const r = method(p.method);
            r.sales = r.sales.plus(p.amount.toString());
          }
        for (const c of collections) {
          const r = method(c.method);
          r.collections = r.collections.plus(c.amount.toString());
        }
        const reversals = await t.collectionReversal.findMany({
          where: {
            createdAt: dates,
            collection: customerId ? { customerId } : {},
          },
          include: { collection: true },
        });
        for (const r of reversals) {
          const x = method(r.collection.method);
          x.reversals = x.reversals.plus(r.collection.amount.toString());
        }
        for (const r of returns) {
          const x = method(r.refundMethod);
          x.refunds = x.refunds.plus(r.refundAmount.toString());
        }
        for (const x of methods.values())
          rows.push({
            method: x.method,
            invoiceAllocations: x.sales.toFixed(2),
            customerCollections: x.collections.toFixed(2),
            collectionReversals: x.reversals.toFixed(2),
            refunds: x.refunds.toFixed(2),
            netMovement: x.sales
              .plus(x.collections)
              .minus(x.reversals)
              .minus(x.refunds)
              .toFixed(2),
            classification: ["CREDIT", "ADVANCE"].includes(x.method)
              ? "Non-cash ledger movement"
              : "Operator recorded payment",
          });
      }
      return {
        kind,
        from,
        to,
        asOf: to,
        note: ["outstanding", "overdue", "aging"].includes(kind)
          ? "Balances reconstructed from immutable history through the selected end date; aging uses invoice due dates. Opening balance shown in oldest bucket."
          : "Posting dates use Asia/Karachi; sales exclude tax; collections do not create revenue.",
        rows,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
