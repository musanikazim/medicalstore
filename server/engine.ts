import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";
import { z } from "zod";
import { validateStockExpiry } from "./expiry";
import { businessDate, normalizeExpiry } from "../shared/expiry";
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
export const D = (v: Decimal.Value) => new Decimal(v);
export const money = (v: Decimal.Value) => D(v).toDecimalPlaces(2);
export const today = businessDate;
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
export const amount = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine(
    (v) => /^\d{1,10}(\.\d{1,6})?$/.test(v),
    "Expected a nonnegative decimal with at most six decimal places",
  );
const expiryDate = z.string().transform(normalizeExpiry).pipe(date);
const currency = amount.refine(
  (v) => D(v).decimalPlaces() <= 2,
  "Use at most two decimal places",
);
const integer = z.number().int().positive().max(10000000);
const text = z.string().trim().min(1).max(250);
export const medicineSchema = z.object({
  name: text,
  generic: z.string().max(250).default(""),
  manufacturer: z.string().max(250).default(""),
  category: z.string().max(100).default(""),
  barcode: z.string().max(100).nullable().default(null),
  strength: z.string().max(100).default(""),
  form: text.default("Tablet"),
  baseUnit: text.default("tablet"),
  purchaseUnit: z.enum(["base", "strip", "box"]).default("box"),
  sellingUnit: z.enum(["base", "strip", "box"]).default("base"),
  unitsPerStrip: integer.default(10),
  stripsPerBox: integer.default(10),
  looseAllowed: z.boolean().default(true),
  prescription: z.boolean().default(false),
  purchasePrice: amount.default("0"),
  salePrice: amount.default("0"),
  stripPrice: amount.nullable().default(null),
  boxPrice: amount.nullable().default(null),
  mrp: amount.nullable().default(null),
  minimumStock: z.number().int().nonnegative().default(10),
  reorderQuantity: integer.default(100),
  active: z.boolean().default(true),
});
const item = z.object({
  medicineId: text,
  unit: z.enum(["base", "strip", "box"]),
  quantity: integer,
});
export const purchaseSchema = z.object({
  supplierId: text,
  supplierInvoice: text,
  invoiceDate: date,
  receivingDate: date,
  remarks: z.string().max(2000).default(""),
  charges: currency.default("0"),
  discount: currency.default("0"),
  lines: z
    .array(
      item.extend({
        batchNumber: text,
        ignoreExpiryWarning: z.boolean().default(false),
        expiry: expiryDate,
        bonus: z.number().int().nonnegative().max(10000000).default(0),
        unitCost: amount,
        discount: currency.default("0"),
        sellingPrice: amount,
      }),
    )
    .min(1)
    .max(200),
});
export const saleSchema = z.object({
  key: z.string().uuid(),
  lines: z
    .array(item.extend({ discount: currency.default("0") }))
    .min(1)
    .max(200),
  discount: currency.default("0"),
  payment: z.enum(["CASH", "CARD", "RAAST", "OTHER"]),
  tendered: currency,
  prescriptionReference: z.string().max(250).default(""),
});
export type Actor = { id: string; role: string };
export function requireRole(a: Actor, roles: string[]) {
  if (!roles.includes(a.role)) throw new Error("FORBIDDEN");
}
export const managers = ["ADMIN", "MANAGER"];
export function factor(
  m: { unitsPerStrip: number; stripsPerBox: number; looseAllowed: boolean },
  unit: string,
) {
  if (unit === "base" && !m.looseAllowed)
    throw new Error("Loose unit sales are disabled");
  const n =
    unit === "box"
      ? m.unitsPerStrip * m.stripsPerBox
      : unit === "strip"
        ? m.unitsPerStrip
        : 1;
  if (!Number.isSafeInteger(n) || n > 10000000)
    throw new Error("Invalid packaging conversion");
  return n;
}
export async function transaction<T>(
  fn: (t: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try {
      return await db.$transaction(
        async (t) => {
          await t.$executeRaw`SELECT pg_advisory_xact_lock(4815162342::bigint)`;
          return fn(t);
        },
        { isolationLevel: "Serializable", maxWait: 15000, timeout: 30000 },
      );
    } catch (e: any) {
      if (e.code === "P2034" && i < 4) continue;
      throw e;
    }
  }
  throw new Error("Transaction retry exhausted");
}
export async function audit(
  t: Prisma.TransactionClient,
  a: Actor,
  action: string,
  entity: string,
  details: any = {},
) {
  await t.audit.create({
    data: {
      userId: a.id,
      action,
      entity,
      details: JSON.parse(JSON.stringify(details)),
    },
  });
}
async function once(
  t: Prisma.TransactionClient,
  key: string,
  payload: any,
  fn: () => Promise<any>,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const old = await t.operation.findUnique({ where: { key } });
  if (old) {
    if (old.hash !== hash)
      throw new Error(
        "Idempotency key was already used for a different request",
      );
    return old.result;
  }
  const result = JSON.parse(JSON.stringify(await fn()));
  await t.operation.create({ data: { key, hash, result } });
  return result;
}
async function move(
  t: Prisma.TransactionClient,
  a: Actor,
  batchId: string,
  quantity: number,
  type: string,
  reference: string,
  reason = "",
  effectiveDate = today(),
) {
  const b = await t.batch.findUniqueOrThrow({ where: { id: batchId } });
  if (b.quantity + quantity < 0) throw new Error("Insufficient batch stock");
  await t.batch.update({
    where: { id: batchId },
    data: { quantity: { increment: quantity } },
  });
  await t.movement.create({
    data: {
      batchId,
      quantity,
      type,
      reference,
      reason,
      effectiveDate,
      createdBy: a.id,
    },
  });
}
export async function saveMedicine(a: Actor, input: unknown, id?: string) {
  requireRole(a, managers);
  const data = medicineSchema.parse(input);
  data.barcode = data.barcode || null;
  return transaction(async (t) => {
    if (id) {
      const used = await t.batch.count({ where: { medicineId: id } });
      const usedSales = await t.saleLine.count({ where: { medicineId: id } });
      const old = await t.medicine.findUniqueOrThrow({ where: { id } });
      if (
        (used || usedSales) &&
        (old.unitsPerStrip !== data.unitsPerStrip ||
          old.stripsPerBox !== data.stripsPerBox ||
          old.baseUnit !== data.baseUnit)
      )
        throw new Error(
          "Packaging is immutable after transactions; register a new medicine",
        );
    }
    const m = id
      ? await t.medicine.update({ where: { id }, data })
      : await t.medicine.create({ data });
    await audit(t, a, id ? "MEDICINE_UPDATE" : "MEDICINE_CREATE", m.id, data);
    return m;
  });
}
export async function savePurchase(a: Actor, input: unknown, id?: string) {
  requireRole(a, managers);
  const p = purchaseSchema.parse(input);
  return transaction(async (t) => {
    if (id) {
      const old = await t.purchase.findUniqueOrThrow({ where: { id } });
      if (old.status !== "DRAFT")
        throw new Error("Posted purchases are immutable");
      await t.purchaseLine.deleteMany({ where: { purchaseId: id } });
    }
    const lines = [];
    for (const l of p.lines) {
      const m = await t.medicine.findUniqueOrThrow({
        where: { id: l.medicineId },
      });
      if (!m.active) throw new Error("Medicine inactive");
      const f =
        l.unit === "box"
          ? m.unitsPerStrip * m.stripsPerBox
          : l.unit === "strip"
            ? m.unitsPerStrip
            : 1;
      const net = money(D(l.unitCost).mul(l.quantity).minus(l.discount));
      if (net.isNegative()) throw new Error("Line discount exceeds line value");
      if ((l.quantity + l.bonus) * f > 100000000)
        throw new Error("Quantity too large");
      lines.push({ ...l, factor: f, net: net.toFixed(6) });
    }
    const total = money(
      Decimal.sum(...lines.map((l) => l.net))
        .plus(p.charges)
        .minus(p.discount),
    );
    if (total.isNegative()) throw new Error("Invoice discount exceeds total");
    const { lines: _, ...header } = p;
    const data = {
      ...header,
      total: total.toFixed(6),
      lines: { create: lines },
    };
    const out = id
      ? await t.purchase.update({ where: { id }, data })
      : await t.purchase.create({ data: { ...data, createdBy: a.id } });
    await audit(t, a, "PURCHASE_DRAFT", out.id);
    return out;
  });
}
export async function postPurchase(
  a: Actor,
  id: string,
  key: string,
  overrides: unknown = [],
) {
  requireRole(a, managers);
  z.string().uuid().parse(key);
  const acknowledged = z
    .array(
      z.object({
        lineId: text,
        medicineId: text,
        batchNumber: text,
        expiry: expiryDate,
      }),
    )
    .max(200)
    .parse(overrides);
  return transaction((t) =>
    once(
      t,
      key,
      {
        type: "purchase",
        id,
        actor: a.id,
        ...(acknowledged.length ? { acknowledged } : {}),
      },
      async () => {
        const p = await t.purchase.findUniqueOrThrow({
          where: { id },
          include: { lines: true },
        });
        if (p.status !== "DRAFT") throw new Error("Purchase already posted");
        const expiryOverrides = [];
        for (const line of p.lines) {
          const confirmed = acknowledged.some(
            (o) =>
              o.lineId === line.id &&
              o.medicineId === line.medicineId &&
              o.batchNumber === line.batchNumber &&
              o.expiry === line.expiry,
          );
          const detail = await validateStockExpiry(
            t,
            {
              ...line,
              ignoreExpiryWarning: confirmed || line.ignoreExpiryWarning,
            },
            "PURCHASE",
          );
          if (detail) expiryOverrides.push({ ...detail, lineId: line.id });
        }
        const sum = Decimal.sum(...p.lines.map((l) => l.net.toString()));
        let allocated = D(0);
        for (let i = 0; i < p.lines.length; i++) {
          const l = p.lines[i];
          const received = (l.quantity + l.bonus) * l.factor;
          const costTotal =
            i === p.lines.length - 1
              ? D(p.total.toString()).minus(allocated)
              : Decimal.min(
                  D(p.total.toString()).minus(allocated),
                  D(p.total.toString())
                    .mul(
                      sum.isZero()
                        ? D(1).div(p.lines.length)
                        : D(l.net.toString()).div(sum),
                    )
                    .toDecimalPlaces(6),
                );
          allocated = allocated.plus(costTotal);
          const batch = await t.batch.create({
            data: {
              medicineId: l.medicineId,
              purchaseLineId: l.id,
              number: l.batchNumber,
              expiry: l.expiry,
              received,
              quantity: 0,
              cost: costTotal.div(received).toFixed(6),
            },
          });
          await move(t, a, batch.id, received, "PURCHASE", p.id);
          await t.medicine.update({
            where: { id: l.medicineId },
            data: { salePrice: l.sellingPrice },
          });
        }
        await t.purchase.update({
          where: { id },
          data: { status: "POSTED", postedAt: new Date() },
        });
        for (const detail of expiryOverrides)
          await audit(t, a, "EXPIRY_WARNING_OVERRIDE", id, {
            ...detail,
            sourceTransaction: id,
          });
        await audit(t, a, "PURCHASE_POST", id);
        return { id, status: "POSTED" };
      },
    ),
  );
}
export async function completeSale(a: Actor, input: unknown) {
  const p = saleSchema.parse(input);
  return transaction((t) =>
    once(t, p.key, { ...p, actor: a.id, type: "sale" }, async () => {
      const store =
        ((await t.settings.findUnique({ where: { id: "store" } }))
          ?.data as any) || {};
      const planned = [];
      let subtotal = D(0),
        cogs = D(0);
      const reserved = new Map<string, number>();
      for (const l of p.lines) {
        const m = await t.medicine.findUniqueOrThrow({
          where: { id: l.medicineId },
        });
        if (!m.active) throw new Error("Medicine inactive");
        if (m.prescription && !p.prescriptionReference.trim())
          throw new Error("Prescription reference required for " + m.name);
        if (
          store.allowLooseSales === false &&
          l.unit === "base" &&
          m.unitsPerStrip > 1
        )
          throw new Error("Loose unit sales are disabled by store policy");
        const f = factor(m, l.unit),
          needed = l.quantity * f;
        if (!Number.isSafeInteger(needed) || needed > 100000000)
          throw new Error("Quantity too large");
        const price = D(
          (l.unit === "box"
            ? (m.boxPrice ?? m.salePrice.mul(f))
            : l.unit === "strip"
              ? (m.stripPrice ?? m.salePrice.mul(f))
              : m.salePrice
          ).toString(),
        );
        if (m.mrp && price.gt(D(m.mrp.toString()).mul(f)))
          throw new Error("Selling price exceeds configured base-unit MRP");
        const net = money(price.mul(l.quantity).minus(l.discount));
        if (net.isNegative()) throw new Error("Discount exceeds line value");
        let remaining = needed,
          lineCost = D(0);
        const allocations = [];
        const batches = await t.batch.findMany({
          where: {
            medicineId: m.id,
            status: "SELLABLE",
            expiry: { gte: today() },
            quantity: { gt: 0 },
          },
          orderBy: [{ expiry: "asc" }, { id: "asc" }],
        });
        for (const b of batches) {
          const available = b.quantity - (reserved.get(b.id) || 0);
          const take = Math.min(remaining, available);
          if (take <= 0) continue;
          reserved.set(b.id, (reserved.get(b.id) || 0) + take);
          allocations.push({ batchId: b.id, quantity: take, cost: b.cost });
          lineCost = lineCost.plus(D(b.cost.toString()).mul(take));
          remaining -= take;
          if (!remaining) break;
        }
        if (remaining)
          throw new Error("Insufficient sellable stock: " + m.name);
        subtotal = subtotal.plus(net);
        cogs = cogs.plus(lineCost);
        planned.push({
          ...l,
          factor: f,
          name: m.name,
          price: price.toFixed(6),
          net,
          cogs: lineCost,
          allocations,
        });
      }
      const allDiscount = D(p.discount).plus(
        p.lines.reduce((sum, l) => sum.plus(l.discount), D(0)),
      );
      const fullPrice = subtotal.plus(
        p.lines.reduce((sum, l) => sum.plus(l.discount), D(0)),
      );
      if (
        a.role === "CASHIER" &&
        allDiscount.gt(
          fullPrice.mul(Number(store.cashierDiscountPercent || 0)).div(100),
        )
      )
        throw new Error(
          "Cashier discounts require a manager or must stay within the configured limit",
        );
      if (D(p.discount).gt(subtotal))
        throw new Error("Invoice discount exceeds subtotal");
      const total = money(subtotal.minus(p.discount));
      if (p.payment === "CASH" && D(p.tendered).lt(total))
        throw new Error("Cash tendered is less than total");
      const sale = await t.sale.create({
        data: {
          createdBy: a.id,
          total: total.toFixed(6),
          cogs: cogs.toFixed(6),
          discount: p.discount,
          prescriptionReference: p.prescriptionReference,
          payments: {
            create: {
              method: p.payment,
              amount: total.toFixed(6),
              tendered: p.payment === "CASH" ? p.tendered : total.toFixed(6),
            },
          },
        },
      });
      let allocatedDiscount = D(0),
        cumulativeNet = D(0);
      for (let i = 0; i < planned.length; i++) {
        const l = planned[i];
        cumulativeNet = cumulativeNet.plus(l.net);
        const share =
          i === planned.length - 1
            ? D(p.discount).minus(allocatedDiscount)
            : subtotal.isZero()
              ? D(0)
              : D(p.discount)
                  .mul(cumulativeNet)
                  .div(subtotal)
                  .toDecimalPlaces(2)
                  .minus(allocatedDiscount);
        allocatedDiscount = allocatedDiscount.plus(share);
        const line = await t.saleLine.create({
          data: {
            saleId: sale.id,
            medicineId: l.medicineId,
            name: l.name,
            unit: l.unit,
            factor: l.factor,
            quantity: l.quantity,
            price: l.price,
            discount: D(l.discount).plus(share).toFixed(6),
            net: l.net.minus(share).toFixed(6),
            cogs: l.cogs.toFixed(6),
            allocations: { create: l.allocations },
          },
        });
        for (const al of l.allocations)
          await move(t, a, al.batchId, -al.quantity, "SALE", sale.id);
      }
      await audit(t, a, "SALE_POST", sale.id);
      return {
        id: sale.id,
        number: sale.number,
        total: sale.total.toString(),
        change:
          p.payment === "CASH"
            ? money(D(p.tendered).minus(total)).toFixed(2)
            : "0.00",
      };
    }),
  );
}
const openingSchema = z.object({
  key: z.string().uuid(),
  medicineId: text,
  batchNumber: text,
  expiry: expiryDate,
  quantity: integer,
  unit: z.enum(["base", "strip", "box"]),
  unitCost: amount,
  reference: text,
  ignoreExpiryWarning: z.boolean().default(false),
  status: z
    .enum(["SELLABLE", "QUARANTINED", "DAMAGED", "RECALLED"])
    .default("SELLABLE"),
  openingDate: date
    .refine((v) => v <= today(), "Opening date cannot be in the future")
    .optional(),
});
export async function opening(a: Actor, input: unknown) {
  requireRole(a, managers);
  const p = openingSchema.parse(input);
  return transaction((t) =>
    once(t, p.key, { ...p, type: "opening", actor: a.id }, async () => {
      const m = await t.medicine.findUniqueOrThrow({
        where: { id: p.medicineId },
      });
      if (
        await t.movement.findFirst({
          where: {
            type: "OPENING",
            reference: p.reference,
            batch: {
              medicineId: m.id,
              number: p.batchNumber,
              expiry: p.expiry,
            },
          },
        })
      )
        throw new Error(
          "Duplicate opening stock reference for this medicine and batch",
        );
      const f =
        p.unit === "box"
          ? m.unitsPerStrip * m.stripsPerBox
          : p.unit === "strip"
            ? m.unitsPerStrip
            : 1;
      const n = p.quantity * f;
      if (n > 100000000) throw new Error("Quantity too large");
      const expiryOverride = await validateStockExpiry(t, p, "OPENING");
      const b = await t.batch.create({
        data: {
          medicineId: m.id,
          number: p.batchNumber,
          expiry: p.expiry,
          status: p.status,
          quantity: 0,
          received: n,
          cost: D(p.unitCost).div(f).toFixed(6),
        },
      });
      await move(
        t,
        a,
        b.id,
        n,
        "OPENING",
        p.reference,
        "",
        p.openingDate || today(),
      );
      if (expiryOverride)
        await audit(t, a, "EXPIRY_WARNING_OVERRIDE", b.id, {
          ...expiryOverride,
          sourceTransaction: p.reference,
          batchId: b.id,
        });
      await audit(t, a, "OPENING", b.id, p);
      return b;
    }),
  );
}
export async function adjust(a: Actor, input: unknown) {
  requireRole(a, ["ADMIN"]);
  const p = z
    .object({
      key: z.string().uuid(),
      batchId: text,
      quantity: z
        .number()
        .int()
        .min(-100000000)
        .max(100000000)
        .refine((n) => n !== 0),
      reason: text,
      reference: text,
    })
    .parse(input);
  return transaction((t) =>
    once(t, p.key, { ...p, type: "adjust", actor: a.id }, async () => {
      await move(
        t,
        a,
        p.batchId,
        p.quantity,
        "ADJUSTMENT",
        p.reference,
        p.reason,
      );
      await audit(t, a, "ADJUSTMENT", p.batchId, p);
      return { ok: true };
    }),
  );
}
export async function batchStatus(
  a: Actor,
  id: string,
  status: string,
  reason: string,
  ignoreExpiryWarning = false,
) {
  requireRole(a, managers);
  z.enum(["SELLABLE", "QUARANTINED", "RECALLED", "DAMAGED"]).parse(status);
  text.parse(reason);
  return transaction(async (t) => {
    const batch = await t.batch.findUniqueOrThrow({ where: { id } });
    const override =
      status === "SELLABLE"
        ? await validateStockExpiry(
            t,
            {
              medicineId: batch.medicineId,
              batchNumber: batch.number,
              expiry: batch.expiry,
              ignoreExpiryWarning: z.boolean().parse(ignoreExpiryWarning),
            },
            "BATCH_RELEASE",
          )
        : null;
    const out = await t.batch.update({ where: { id }, data: { status } });
    if (override)
      await audit(t, a, "EXPIRY_WARNING_OVERRIDE", id, {
        ...override,
        sourceTransaction: id,
      });
    await audit(t, a, "BATCH_STATUS", id, { status, reason });
    return out;
  });
}
export async function returnStock(a: Actor, input: unknown) {
  requireRole(a, managers);
  const p = z
    .object({
      key: z.string().uuid(),
      type: z.enum(["SALE", "PURCHASE"]),
      originalId: text,
      quantity: integer,
      reason: text,
      reference: text,
      disposition: z
        .enum(["SELLABLE", "QUARANTINED", "DAMAGED"])
        .default("QUARANTINED"),
    })
    .parse(input);
  return transaction((t) =>
    once(
      t,
      p.key,
      { ...p, type: "return-" + p.type, actor: a.id },
      async () => {
        if (p.type === "SALE") {
          const al = await t.allocation.findUniqueOrThrow({
            where: { id: p.originalId },
            include: { saleLine: true, batch: true },
          });
          if (p.quantity > al.quantity - al.returned)
            throw new Error("Return exceeds original sale quantity");
          if (
            p.disposition === "SELLABLE" &&
            (al.batch.expiry < today() || al.batch.status !== "SELLABLE")
          )
            throw new Error("Returned stock is expired or restricted");
          const allAllocations = await t.allocation.findMany({
            where: { saleLineId: al.saleLineId },
          });
          const prior = await t.returnRecord.findMany({
            where: {
              type: "SALE",
              originalId: { in: allAllocations.map((x) => x.id) },
            },
          });
          const returned = allAllocations.reduce(
            (sum, x) => sum + x.returned,
            0,
          );
          const refunded = prior.reduce(
            (sum, x) => sum.plus(x.amount.toString()),
            D(0),
          );
          const amount = money(
            D(al.saleLine.net.toString())
              .mul(returned + p.quantity)
              .div(al.saleLine.quantity * al.saleLine.factor),
          ).minus(refunded);
          const cogs = D(al.cost.toString()).mul(p.quantity);
          const b =
            p.disposition === "SELLABLE"
              ? al.batch
              : await t.batch.create({
                  data: {
                    medicineId: al.batch.medicineId,
                    purchaseLineId: al.batch.purchaseLineId,
                    number: al.batch.number,
                    expiry: al.batch.expiry,
                    status: p.disposition,
                    quantity: 0,
                    received: p.quantity,
                    cost: al.cost,
                  },
                });
          const r = await t.returnRecord.create({
            data: {
              type: "SALE",
              reference: p.reference,
              originalId: al.id,
              batchId: b.id,
              quantity: p.quantity,
              amount: amount.toFixed(6),
              cogs: cogs.toFixed(6),
              disposition: p.disposition,
              reason: p.reason,
              createdBy: a.id,
            },
          });
          await t.allocation.update({
            where: { id: al.id },
            data: { returned: { increment: p.quantity } },
          });
          await move(t, a, b.id, p.quantity, "SALE_RETURN", r.id, p.reason);
          await audit(t, a, "SALE_RETURN", r.id, p);
          return r;
        }
        const b = await t.batch.findUniqueOrThrow({
          where: { id: p.originalId },
          include: { purchaseLine: true },
        });
        if (!b.purchaseLine)
          throw new Error("Purchase return requires original purchase batch");
        const old = await t.returnRecord.aggregate({
          where: { type: "PURCHASE", originalId: b.purchaseLine.id },
          _sum: { quantity: true },
        });
        if (
          p.quantity + (old._sum.quantity || 0) >
          (b.purchaseLine.quantity + b.purchaseLine.bonus) *
            b.purchaseLine.factor
        )
          throw new Error("Return exceeds purchase quantity");
        const value = D(b.cost.toString()).mul(p.quantity);
        const r = await t.returnRecord.create({
          data: {
            type: "PURCHASE",
            originalId: b.purchaseLine.id,
            reference: p.reference,
            batchId: b.id,
            quantity: p.quantity,
            amount: value.toFixed(6),
            cogs: value.toFixed(6),
            disposition: "SUPPLIER",
            reason: p.reason,
            createdBy: a.id,
          },
        });
        await move(t, a, b.id, -p.quantity, "PURCHASE_RETURN", r.id, p.reason);
        await audit(t, a, "PURCHASE_RETURN", r.id, p);
        return r;
      },
    ),
  );
}
export async function importOpening(a: Actor, input: unknown) {
  requireRole(a, managers);
  const p = z
    .object({
      key: z.string().uuid(),
      rows: z
        .array(openingSchema.omit({ key: true }))
        .min(1)
        .max(500),
    })
    .parse(input);
  return transaction((t) =>
    once(t, p.key, { ...p, type: "opening-import", actor: a.id }, async () => {
      for (const row of p.rows) {
        const m = await t.medicine.findUniqueOrThrow({
          where: { id: row.medicineId },
        });
        if (!m.active) throw new Error("Medicine inactive: " + m.name);
        if (
          await t.movement.findFirst({
            where: {
              type: "OPENING",
              reference: row.reference,
              batch: {
                medicineId: m.id,
                number: row.batchNumber,
                expiry: row.expiry,
              },
            },
          })
        )
          throw new Error("Duplicate opening stock row for " + m.name);
        const f =
          row.unit === "box"
            ? m.unitsPerStrip * m.stripsPerBox
            : row.unit === "strip"
              ? m.unitsPerStrip
              : 1;
        const quantity = row.quantity * f;
        if (quantity > 100000000) throw new Error("Quantity too large");
        const expiryOverride = await validateStockExpiry(
          t,
          row,
          "OPENING_IMPORT",
        );
        const b = await t.batch.create({
          data: {
            medicineId: m.id,
            number: row.batchNumber,
            expiry: row.expiry,
            status: row.status,
            quantity: 0,
            received: quantity,
            cost: D(row.unitCost).div(f).toFixed(6),
          },
        });
        await move(
          t,
          a,
          b.id,
          quantity,
          "OPENING",
          row.reference,
          "",
          row.openingDate || today(),
        );
        if (expiryOverride)
          await audit(t, a, "EXPIRY_WARNING_OVERRIDE", b.id, {
            ...expiryOverride,
            sourceTransaction: row.reference,
            batchId: b.id,
          });
        await audit(t, a, "OPENING_IMPORT", b.id, row);
      }
      return { count: p.rows.length };
    }),
  );
}
