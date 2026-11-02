import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  db,
  D,
  money,
  today,
  transaction,
  audit,
  once,
  requireRole,
  managers,
  type Actor,
} from "./core";
const text = z.string().trim().min(1).max(250);
const decimal = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (v) => /^\d{1,10}(\.\d{1,2})?$/.test(v),
    "Enter a nonnegative PKR amount with at most two decimals",
  );
const iso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid payment date",
  );
export const paymentSchema = z
  .object({
    method: z.enum([
      "CASH",
      "CARD",
      "TRANSFER",
      "CREDIT",
      "ADVANCE",
      "RAAST",
      "OTHER",
    ]),
    amount: decimal,
    tendered: decimal.optional(),
    reference: z.string().max(250).default(""),
    cardLastFour: z
      .string()
      .regex(/^(\d{4})?$/)
      .default(""),
    terminal: z.string().max(100).default(""),
    bankAccountId: z.string().nullable().optional(),
    paymentDate: iso.optional(),
    remarks: z.string().max(1000).default(""),
  })
  .strict();
export type PaymentInput = z.infer<typeof paymentSchema>;
export async function balance(t: Prisma.TransactionClient, customerId: string) {
  const c = await t.customer.findUniqueOrThrow({ where: { id: customerId } });
  const accounts = await t.creditAccount.findMany({ where: { customerId } });
  const outstanding = accounts.reduce(
    (s, x) =>
      s
        .plus(x.original.toString())
        .minus(x.settled.toString())
        .minus(x.returned.toString()),
    D(c.openingOutstanding.toString()),
  );
  return {
    customer: c,
    outstanding,
    advance: D(c.advance.toString()),
    net: outstanding.minus(c.advance.toString()),
  };
}
export async function ledger(
  t: Prisma.TransactionClient,
  a: Actor,
  customerId: string,
  type: string,
  reference: string,
  debit: string | number,
  credit: string | number,
  saleId?: string,
  collectionId?: string,
  remarks = "",
) {
  if (D(debit).isZero() && D(credit).isZero()) return;
  await t.customerLedger.create({
    data: {
      customerId,
      type,
      reference,
      debit,
      credit,
      saleId,
      collectionId,
      remarks,
      createdBy: a.id,
    },
  });
}
export async function customerList(a: Actor, q = "") {
  const rows = await db.customer.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { mobile: { contains: q } },
        ...(/^\d+$/.test(q) ? [{ code: { equals: Number(q) } }] : []),
      ],
    },
    orderBy: { name: "asc" },
    take: 500,
    include: { accounts: true },
  });
  return rows.map((c) => {
    const outstanding = c.accounts.reduce(
      (s, x) =>
        s
          .plus(x.original.toString())
          .minus(x.settled.toString())
          .minus(x.returned.toString()),
      D(c.openingOutstanding.toString()),
    );
    const { accounts, ...rest } = c;
    return {
      ...rest,
      outstanding: outstanding.toFixed(2),
      advance: c.advance.toFixed(2),
      netBalance: outstanding.minus(c.advance.toString()).toFixed(2),
      availableCredit: c.creditLimit
        ? D(c.creditLimit.toString()).minus(outstanding).toFixed(2)
        : null,
    };
  });
}
export async function saveCustomer(a: Actor, input: unknown, id?: string) {
  const p = z
    .object({
      key: z.string().uuid().optional(),
      name: text,
      mobile: z.string().max(40).default(""),
      alternateMobile: z.string().max(40).default(""),
      address: z.string().max(1000).default(""),
      typeId: z.string().nullable().optional(),
      creditEnabled: z.boolean().default(false),
      creditLimit: decimal.nullable().optional(),
      creditDays: z.number().int().min(0).max(3650).default(30),
      openingBalance: decimal.default("0"),
      active: z.boolean().default(true),
      notes: z.string().max(2000).default(""),
    })
    .parse(input);
  if (
    a.role === "CASHIER" &&
    (id ||
      p.creditEnabled ||
      D(p.openingBalance).gt(0) ||
      (p.creditLimit !== undefined && p.creditLimit !== null))
  )
    throw new Error("FORBIDDEN");
  if (id) requireRole(a, managers);
  if (D(p.openingBalance).gt(0)) requireRole(a, ["ADMIN"]);
  if (id && D(p.openingBalance).gt(0))
    throw new Error(
      "Opening balance is immutable; use an authorized credit note/adjustment",
    );
  return transaction(async (t) => {
    const run = async () => {
      if (p.typeId) {
        const kind = await t.masterData.findUniqueOrThrow({
          where: { id: p.typeId },
        });
        if (kind.kind !== "CUSTOMER_TYPE" || !kind.active)
          throw new Error("Customer type is unavailable");
      }
      const { key, openingBalance, ...data } = p;
      const old = id
        ? await t.customer.findUniqueOrThrow({ where: { id } })
        : null;
      if (
        id &&
        p.creditLimit !== undefined &&
        p.creditLimit !== null &&
        (await balance(t, id)).outstanding.gt(p.creditLimit)
      )
        throw new Error(
          "Credit limit cannot be reduced below current outstanding",
        );
      const c = id
        ? await t.customer.update({ where: { id }, data })
        : await t.customer.create({
            data: { ...data, openingOutstanding: openingBalance },
          });
      if (!id && D(openingBalance).gt(0))
        await ledger(
          t,
          a,
          c.id,
          "OPENING",
          c.id,
          openingBalance,
          0,
          undefined,
          undefined,
          "Authorized opening balance",
        );
      await audit(t, a, id ? "CUSTOMER_UPDATE" : "CUSTOMER_CREATE", c.id, {
        ...data,
        openingBalance,
        previousCreditEnabled: old?.creditEnabled,
        previousCreditLimit: old?.creditLimit?.toString(),
      });
      return c;
    };
    return p.key
      ? once(t, p.key, { type: "customer", ...p, id, actor: a.id }, run)
      : run();
  });
}
export async function bankAccounts(a: Actor, all = false) {
  if (all) requireRole(a, managers);
  return db.bankAccount.findMany({
    where: all ? {} : { active: true },
    orderBy: { name: "asc" },
  });
}
export async function saveBank(a: Actor, input: unknown, id?: string) {
  requireRole(a, managers);
  const p = z
    .object({
      name: text,
      bankName: text,
      accountTitle: text,
      accountNumber: text,
      active: z.boolean().default(true),
    })
    .parse(input);
  return transaction(async (t) => {
    const b = id
      ? await t.bankAccount.update({ where: { id }, data: p })
      : await t.bankAccount.create({ data: p });
    await audit(t, a, "BANK_ACCOUNT_SAVE", b.id, {
      name: b.name,
      active: b.active,
    });
    return b;
  });
}
export async function validatePayments(
  t: Prisma.TransactionClient,
  a: Actor,
  total: Prisma.Decimal | ReturnType<typeof D>,
  inputs: PaymentInput[],
  customerId?: string | null,
) {
  if (!inputs.length) throw new Error("Allocate at least one payment method");
  const sum = inputs.reduce((s, p) => s.plus(p.amount), D(0));
  if (!sum.eq(total.toString()))
    throw new Error(
      `Payment allocation ${sum.toFixed(2)} must equal invoice total ${D(total.toString()).toFixed(2)}`,
    );
  let credit = D(0),
    advance = D(0),
    change = D(0);
  for (const p of inputs) {
    if (p.method === "CREDIT") credit = credit.plus(p.amount);
    if (p.method === "ADVANCE") advance = advance.plus(p.amount);
    if (p.method === "CASH") {
      const tendered = D(p.tendered ?? p.amount);
      if (tendered.lt(p.amount))
        throw new Error(
          `Cash tendered ${tendered.toFixed(2)} is less than cash allocation ${D(p.amount).toFixed(2)}`,
        );
      change = change.plus(tendered.minus(p.amount));
    }
    if (p.method === "TRANSFER") {
      if (!p.bankAccountId || !p.reference.trim())
        throw new Error(
          "Bank transfer requires a bank account and transaction reference",
        );
      const bank = await t.bankAccount.findUniqueOrThrow({
        where: { id: p.bankAccountId },
      });
      if (!bank.active) throw new Error("Selected bank account is inactive");
    }
    if (p.method !== "TRANSFER" && p.bankAccountId)
      throw new Error("Bank account selection applies to bank transfers");
  }
  let customer = null;
  if (customerId) {
    const b = await balance(t, customerId);
    customer = b.customer;
    if (!customer.active)
      throw new Error(`${customer.name}: customer account is inactive`);
    if (credit.gt(0)) {
      if (!customer.creditEnabled)
        throw new Error(
          `${customer.name}: credit must be enabled by a manager`,
        );
      if (
        customer.creditLimit &&
        b.outstanding.plus(credit).gt(customer.creditLimit.toString())
      )
        throw new Error(
          `${customer.name}: credit limit ${customer.creditLimit.toFixed(2)}, existing outstanding ${b.outstanding.toFixed(2)}, requested credit ${credit.toFixed(2)}`,
        );
    }
    if (advance.gt(b.advance))
      throw new Error(
        `${customer.name}: customer advance balance is only ${b.advance.toFixed(2)}`,
      );
  } else if (credit.gt(0) || advance.gt(0))
    throw new Error("Select a customer for Khata/credit or advance payment");
  return { credit, advance, change, customer };
}
export async function recordCreditSale(
  t: Prisma.TransactionClient,
  a: Actor,
  saleId: string,
  customerId: string | null | undefined,
  credit: ReturnType<typeof D>,
  advance: ReturnType<typeof D>,
  dueDate: string,
) {
  if (!customerId) return;
  if (credit.gt(0)) {
    await t.creditAccount.create({
      data: { saleId, customerId, original: credit.toFixed(6), dueDate },
    });
    await ledger(
      t,
      a,
      customerId,
      "CREDIT_SALE",
      saleId,
      credit.toFixed(6),
      0,
      saleId,
    );
  }
  if (advance.gt(0)) {
    await t.customer.update({
      where: { id: customerId },
      data: { advance: { decrement: advance.toFixed(6) } },
    });
    await ledger(
      t,
      a,
      customerId,
      "ADVANCE_APPLIED",
      saleId,
      advance.toFixed(6),
      0,
      saleId,
    );
  }
}
async function applyToInvoices(
  t: Prisma.TransactionClient,
  a: Actor,
  customerId: string,
  amount: ReturnType<typeof D>,
  reference: string,
  collectionId: string | undefined,
  manual: { saleId: string; amount: string }[] | undefined,
  kind: string,
  dryRun = false,
) {
  let remaining = amount;
  let opening = D(0);
  const current = await balance(t, customerId);
  const accounts = await t.creditAccount.findMany({
    where: { customerId },
    include: { sale: true },
    orderBy: [{ sale: { createdAt: "asc" } }, { saleId: "asc" }],
  });
  const records = [] as { saleId: string; amount: string }[];
  if (!manual) {
    opening = Decimal.min(
      remaining,
      current.customer.openingOutstanding.toString(),
    );
    remaining = remaining.minus(opening);
    if (!dryRun && opening.gt(0))
      await t.customer.update({
        where: { id: customerId },
        data: { openingOutstanding: { decrement: opening.toFixed(6) } },
      });
  }
  const work =
    manual ||
    accounts.map((x) => ({
      saleId: x.saleId,
      amount: D(x.original.toString())
        .minus(x.settled.toString())
        .minus(x.returned.toString())
        .toFixed(6),
    }));
  if (new Set(work.map((x) => x.saleId)).size !== work.length)
    throw new Error("An invoice cannot be allocated twice");
  for (const allocation of work) {
    const account = accounts.find((x) => x.saleId === allocation.saleId);
    if (!account)
      throw new Error("Invoice does not belong to the selected customer");
    const due = D(account.original.toString())
      .minus(account.settled.toString())
      .minus(account.returned.toString());
    const applied = manual ? D(allocation.amount) : Decimal.min(remaining, due);
    if (applied.gt(due) || applied.gt(remaining))
      throw new Error(
        "Payment allocation exceeds invoice outstanding or received amount",
      );
    if (applied.lte(0)) continue;
    if (!dryRun) {
      await t.creditAccount.update({
        where: { saleId: account.saleId },
        data: { settled: { increment: applied.toFixed(6) } },
      });
      await t.settlement.create({
        data: {
          saleId: account.saleId,
          collectionId,
          amount: applied.toFixed(6),
          kind,
          reference,
          createdBy: a.id,
        },
      });
    }
    records.push({ saleId: account.saleId, amount: applied.toFixed(2) });
    remaining = remaining.minus(applied);
    if (remaining.isZero()) break;
  }
  return { remaining, opening, records };
}
export async function collectPayment(a: Actor, input: unknown) {
  const p = z
    .object({
      key: z.string().uuid(),
      customerId: text,
      amount: decimal.refine((v) => D(v).gt(0)),
      method: z.enum(["CASH", "CARD", "TRANSFER"]),
      reference: z.string().max(250).default(""),
      paymentDate: iso,
      bankAccountId: z.string().nullable().optional(),
      remarks: z.string().max(1000).default(""),
      cardLastFour: z
        .string()
        .regex(/^(\d{4})?$/)
        .default(""),
      terminal: z.string().max(100).default(""),
      allowAdvance: z.boolean().default(false),
      allocations: z
        .array(
          z.object({ saleId: text, amount: decimal.refine((v) => D(v).gt(0)) }),
        )
        .max(500)
        .optional(),
    })
    .strict()
    .parse(input);
  return transaction((t) =>
    once(t, p.key, { ...p, type: "collection", actor: a.id }, async () => {
      const b = await balance(t, p.customerId);
      if (!b.customer.active) throw new Error("Customer is inactive");
      await validatePayments(
        t,
        a,
        D(p.amount),
        [{ ...p, amount: p.amount }],
        p.customerId,
      );
      if (D(p.amount).gt(b.outstanding) && !p.allowAdvance)
        throw new Error(
          `Amount exceeds outstanding ${b.outstanding.toFixed(2)}; explicitly enable customer advance to record the excess`,
        );
      const { key, allocations, allowAdvance, ...fields } = p;
      const plan = await applyToInvoices(
        t,
        a,
        p.customerId,
        D(p.amount),
        "preview",
        undefined,
        p.allocations,
        "COLLECTION",
        true,
      );
      if (plan.remaining.gt(0) && !p.allowAdvance)
        throw new Error(
          "Some payment remains unallocated; select more invoices or explicitly allow an advance",
        );
      const collection = await t.collection.create({
        data: {
          ...fields,
          advance: plan.remaining.toFixed(6),
          openingAllocation: plan.opening.toFixed(6),
          createdBy: a.id,
        },
      });
      const applied = await applyToInvoices(
        t,
        a,
        p.customerId,
        D(p.amount),
        collection.id,
        collection.id,
        p.allocations,
        "COLLECTION",
      );
      if (applied.remaining.gt(0) && !p.allowAdvance)
        throw new Error(
          "Some payment remains unallocated; select more invoices or explicitly allow an advance",
        );
      if (applied.remaining.gt(0))
        await t.customer.update({
          where: { id: p.customerId },
          data: { advance: { increment: applied.remaining.toFixed(6) } },
        });
      await ledger(
        t,
        a,
        p.customerId,
        "PAYMENT",
        collection.id,
        D(0).toFixed(6),
        D(p.amount).minus(applied.remaining).toFixed(6),
        undefined,
        collection.id,
        p.remarks,
      );
      if (applied.remaining.gt(0))
        await ledger(
          t,
          a,
          p.customerId,
          "ADVANCE",
          collection.id,
          0,
          applied.remaining.toFixed(6),
          undefined,
          collection.id,
          p.remarks,
        );
      await audit(t, a, "CUSTOMER_PAYMENT", collection.id, {
        customerId: p.customerId,
        amount: p.amount,
        method: p.method,
        advance: applied.remaining.toFixed(2),
        openingAllocation: applied.opening.toFixed(2),
        allocations: applied.records,
      });
      return {
        ...collection,
        advanceAmount: applied.remaining.toFixed(2),
        openingAllocationAmount: applied.opening.toFixed(2),
        allocations: applied.records,
      };
    }),
  );
}
export async function customerDetail(a: Actor, id: string) {
  return db.$transaction(async (t) => {
    const b = await balance(t, id);
    const [entries, accounts, collections, sales] = await Promise.all([
      t.customerLedger.findMany({
        where: { customerId: id },
        orderBy: { sequence: "asc" },
      }),
      t.creditAccount.findMany({
        where: { customerId: id },
        include: {
          sale: {
            select: {
              id: true,
              number: true,
              invoicePrefix: true,
              total: true,
              createdAt: true,
            },
          },
        },
        orderBy: { dueDate: "asc" },
      }),
      t.collection.findMany({
        where: { customerId: id },
        include: { settlements: true, reversal: true },
        orderBy: { createdAt: "desc" },
      }),
      t.sale.findMany({
        where: { customerId: id },
        select: { id: true, number: true, total: true, createdAt: true },
      }),
    ]);
    let running = D(0);
    return {
      customer: b.customer,
      outstanding: b.outstanding.toFixed(2),
      advance: b.advance.toFixed(2),
      netBalance: b.net.toFixed(2),
      ledger: entries.map((x) => {
        running = running.plus(x.debit.toString()).minus(x.credit.toString());
        return { ...x, balance: running.toFixed(2) };
      }),
      accounts: accounts.map((x) => {
        const due = D(x.original.toString())
          .minus(x.settled.toString())
          .minus(x.returned.toString());
        return {
          ...x,
          outstanding: due.toFixed(2),
          status: due.isZero()
            ? "Fully Paid"
            : due.eq(x.original.toString())
              ? "Unpaid"
              : "Partially Paid",
        };
      }),
      collections,
      sales,
    };
  });
}
export async function reverseCollection(a: Actor, id: string, input: unknown) {
  requireRole(a, ["ADMIN"]);
  const p = z.object({ key: z.string().uuid(), reason: text }).parse(input);
  return transaction((t) =>
    once(
      t,
      p.key,
      { ...p, type: "collection-reversal", id, actor: a.id },
      async () => {
        const c = await t.collection.findUniqueOrThrow({
          where: { id },
          include: { settlements: true, reversal: true },
        });
        if (c.reversal) throw new Error("Payment has already been reversed");
        const entries = await t.customerLedger.findMany({
          where: { collectionId: id },
        });
        const advance = entries
          .filter((x) => x.type === "ADVANCE")
          .reduce((s, x) => s.plus(x.credit.toString()), D(0));
        const allocated = c.settlements.reduce(
          (s, x) => s.plus(x.amount.toString()),
          D(0),
        );
        const opening = D(c.amount.toString()).minus(advance).minus(allocated);
        const customer = await t.customer.findUniqueOrThrow({
          where: { id: c.customerId },
        });
        if (advance.gt(customer.advance.toString()))
          throw new Error(
            "The advance has already been used; reverse its later allocations first",
          );
        for (const s of c.settlements) {
          await t.creditAccount.update({
            where: { saleId: s.saleId },
            data: { settled: { decrement: s.amount } },
          });
          await t.settlement.create({
            data: {
              saleId: s.saleId,
              amount: s.amount,
              kind: "REVERSAL",
              reference: id,
              createdBy: a.id,
            },
          });
        }
        await t.customer.update({
          where: { id: c.customerId },
          data: {
            advance: { decrement: advance.toFixed(6) },
            openingOutstanding: { increment: opening.toFixed(6) },
          },
        });
        const reversal = await t.collectionReversal.create({
          data: { collectionId: id, reason: p.reason, createdBy: a.id },
        });
        await ledger(
          t,
          a,
          c.customerId,
          "PAYMENT_REVERSAL",
          reversal.id,
          c.amount.toString(),
          0,
          undefined,
          id,
          p.reason,
        );
        await audit(t, a, "PAYMENT_REVERSAL", id, {
          reason: p.reason,
          reversalId: reversal.id,
        });
        return reversal;
      },
    ),
  );
}
export async function creditNote(a: Actor, input: unknown) {
  requireRole(a, managers);
  const p = z
    .object({
      key: z.string().uuid(),
      customerId: text,
      amount: decimal.refine((v) => D(v).gt(0)),
      reference: text,
      reason: text,
      allowAdvance: z.boolean().default(false),
    })
    .parse(input);
  return transaction((t) =>
    once(t, p.key, { ...p, type: "credit-note", actor: a.id }, async () => {
      const b = await balance(t, p.customerId);
      if (D(p.amount).gt(b.outstanding) && !p.allowAdvance)
        throw new Error(
          "Credit note exceeds outstanding; explicitly permit customer advance",
        );
      const note = await t.creditNote.create({
        data: {
          customerId: p.customerId,
          amount: p.amount,
          reference: p.reference,
          reason: p.reason,
          createdBy: a.id,
        },
      });
      const result = await applyToInvoices(
        t,
        a,
        p.customerId,
        D(p.amount),
        note.id,
        undefined,
        undefined,
        "CREDIT_NOTE",
      );
      if (result.remaining.gt(0))
        await t.customer.update({
          where: { id: p.customerId },
          data: { advance: { increment: result.remaining.toFixed(6) } },
        });
      await ledger(
        t,
        a,
        p.customerId,
        "CREDIT_NOTE",
        note.id,
        0,
        p.amount,
        undefined,
        undefined,
        p.reason,
      );
      await audit(t, a, "CREDIT_NOTE", note.id, p);
      return note;
    }),
  );
}
export async function creditReturn(
  t: Prisma.TransactionClient,
  a: Actor,
  saleId: string,
  amount: ReturnType<typeof D>,
  returnId: string,
  refundMethod: string,
) {
  const sale = await t.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { creditAccount: true },
  });
  let reduction = D(0);
  const account = sale.creditAccount;
  if (account) {
    const due = D(account.original.toString())
      .minus(account.settled.toString())
      .minus(account.returned.toString());
    reduction = Decimal.min(amount, due);
    if (reduction.gt(0)) {
      await t.creditAccount.update({
        where: { saleId },
        data: { returned: { increment: reduction.toFixed(6) } },
      });
      await ledger(
        t,
        a,
        account.customerId,
        "SALE_RETURN",
        returnId,
        0,
        reduction.toFixed(6),
        saleId,
      );
    }
  }
  const refund = amount.minus(reduction);
  if (refund.gt(0) && refundMethod === "ADVANCE") {
    if (!sale.customerId)
      throw new Error(
        "Select a cash/card/bank refund: the original sale has no customer",
      );
    await t.customer.update({
      where: { id: sale.customerId },
      data: { advance: { increment: refund.toFixed(6) } },
    });
    await ledger(
      t,
      a,
      sale.customerId,
      "RETURN_ADVANCE",
      returnId,
      0,
      refund.toFixed(6),
      saleId,
    );
  }
  return {
    customerId: sale.customerId,
    receivableReduction: reduction.toFixed(6),
    refundAmount: refund.toFixed(6),
    refundMethod,
  };
}
