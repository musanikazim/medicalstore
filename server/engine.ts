import {
  validatePayments,
  recordCreditSale,
  creditReturn,
  paymentSchema,
} from "./finance";
import { validateCart, CartValidationError } from "./carts";
import {
  prepareProduct,
  productFields,
  resolveUnit,
  stockIdentity,
  receiveSerials,
} from "./catalogue";
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
  qty,
  type Actor,
} from "./core";
export {
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
import "dotenv/config";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";
import { z } from "zod";
import { validateStockExpiry } from "./expiry";
import { businessDate, normalizeExpiry } from "../shared/expiry";
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
const quantity = z
  .union([z.number(), z.string()])
  .transform((v) => Number(v))
  .refine(
    (v) =>
      Number.isFinite(v) && v > 0 && v <= 10000000 && D(v).decimalPlaces() <= 6,
    "Enter a positive quantity with at most six decimals",
  );
const text = z.string().trim().min(1).max(250);
export const medicineSchema = z.object({
  name: text,
  generic: z.string().max(250).default(""),
  manufacturer: z.string().max(250).default(""),
  category: z.string().max(100).default(""),
  barcode: z.string().max(100).nullable().default(null),
  strength: z.string().max(100).default(""),
  form: z.string().max(150).default("Tablet"),
  baseUnit: text.default("tablet"),
  purchaseUnit: text.default("box"),
  sellingUnit: text.default("base"),
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
  ...productFields,
});
const item = z.object({
  medicineId: text,
  unit: text,
  quantity,
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
        batchNumber: z.string().max(250).default(""),
        ignoreExpiryWarning: z.boolean().default(false),
        expiry: z.union([expiryDate, z.literal("")]).default(""),
        bonus: z
          .number()
          .nonnegative()
          .max(10000000)
          .refine((v) => D(v).decimalPlaces() <= 6)
          .default(0),
        unitCost: amount,
        discount: currency.default("0"),
        sellingPrice: amount,
        mrp: amount.nullable().optional(),
        serialNumbers: z.array(text).max(10000).default([]),
      }),
    )
    .min(1)
    .max(200),
});
export const saleSchema = z.object({
  key: z.string().uuid(),
  lines: z
    .array(
      item.extend({
        discount: currency.default("0"),
        expectedPrice: amount.optional(),
        acceptPriceChange: z.boolean().default(false),
        serialNumbers: z.array(text).max(10000).default([]),
      }),
    )
    .min(1)
    .max(200),
  discount: currency.default("0"),
  payment: z
    .enum(["CASH", "CARD", "RAAST", "OTHER", "TRANSFER", "CREDIT", "ADVANCE"])
    .default("CASH"),
  tendered: currency.default("0"),
  payments: z.array(paymentSchema).max(20).optional(),
  customerId: z.string().nullable().optional(),
  notes: z.string().max(2000).default(""),
  draftId: z.string().uuid().optional(),
  draftVersion: z.number().int().positive().optional(),
  prescriptionReference: z.string().max(250).default(""),
});
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
  if (D(b.quantity.toString()).plus(quantity).lt(0))
    throw new Error("Insufficient batch stock");
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
  const parsed = medicineSchema.parse(input);
  parsed.barcode = parsed.barcode || null;
  return transaction(async (t) => {
    const oldProduct = id
      ? await t.medicine.findUniqueOrThrow({ where: { id } })
      : undefined;
    const { data, units } = await prepareProduct(t, parsed, oldProduct);
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
    await t.productUnit.deleteMany({ where: { medicineId: m.id } });
    if (units.length)
      await t.productUnit.createMany({
        data: units.map((u) => ({ ...u, medicineId: m.id })),
      });
    if (m.mrp && m.salePrice.gt(m.mrp))
      await audit(t, a, "MRP_WARNING", m.id, {
        product: m.name,
        mrp: m.mrp.toString(),
        sellingPrice: m.salePrice.toString(),
        notice: "Recorded warning; not a legal approval",
      });
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
      const conversion = await resolveUnit(t, m, l.unit, l.quantity);
      const f = conversion.factor;
      const identity = stockIdentity(m, l.batchNumber, l.expiry);
      if (l.bonus) await resolveUnit(t, m, l.unit, l.bonus);
      const net = money(D(l.unitCost).mul(l.quantity).minus(l.discount));
      if (net.isNegative()) throw new Error("Line discount exceeds line value");
      if ((l.quantity + l.bonus) * f > 100000000)
        throw new Error("Quantity too large");
      lines.push({
        ...l,
        mrp: l.mrp === undefined ? m.mrp : l.mrp,
        ...identity,
        factor: f,
        unitLabel: conversion.name,
        net: net.toFixed(6),
      });
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
        batchNumber: z.string().max(250).default(""),
        expiry: z.union([expiryDate, z.literal("")]).default(""),
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
          const received = qty(
            D(l.quantity.toString())
              .plus(l.bonus.toString())
              .mul(l.factor.toString()),
          );
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
              mrp: l.mrp,
            },
          });
          const m = await t.medicine.findUniqueOrThrow({
            where: { id: l.medicineId },
          });
          await receiveSerials(
            t,
            m,
            batch.id,
            received,
            l.serialNumbers as string[],
          );
          await move(t, a, batch.id, received, "PURCHASE", p.id);
          if (l.mrp && l.sellingPrice.gt(l.mrp))
            await audit(t, a, "MRP_WARNING", p.id, {
              product: m.name,
              batch: l.batchNumber,
              mrp: l.mrp.toString(),
              sellingPrice: l.sellingPrice.toString(),
            });
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
      const validation = await validateCart(
        t,
        p.lines,
        p.prescriptionReference,
        store,
      );
      if (validation.issues.length)
        throw new CartValidationError(validation.issues);
      if (p.draftId) {
        const draft = await t.posDraft.findUniqueOrThrow({
          where: { id: p.draftId },
        });
        if (draft.ownerId !== a.id) throw new Error("FORBIDDEN");
        if (
          !["ACTIVE", "HELD"].includes(draft.status) ||
          draft.version !== p.draftVersion
        )
          throw new Error(
            "Draft changed or is already closed; resume the latest version",
          );
      }
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
        const conversion = await resolveUnit(t, m, l.unit, l.quantity, true);
        const f = conversion.factor,
          needed = conversion.quantity,
          price = conversion.price;
        if (m.mrp && price.gt(D(m.mrp.toString()).mul(f)))
          await audit(t, a, "MRP_WARNING", m.id, {
            product: m.name,
            mrp: m.mrp.toString(),
            sellingPrice: price.toString(),
            unit: conversion.name,
            source: "SALE",
          });
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
          const available = qty(
            D(b.quantity.toString()).minus(reserved.get(b.id) || 0),
          );
          const serials = m.serialTracked
            ? await t.stockSerial.findMany({
                where: {
                  batchId: b.id,
                  status: "AVAILABLE",
                  serial: { in: l.serialNumbers },
                },
                orderBy: { serial: "asc" },
              })
            : [];
          const take = Math.min(
            remaining,
            available,
            m.serialTracked ? serials.length : Infinity,
          );
          if (take <= 0) continue;
          reserved.set(b.id, (reserved.get(b.id) || 0) + take);
          allocations.push({
            batchId: b.id,
            quantity: take,
            cost: b.cost,
            serialNumbers: serials.slice(0, take).map((x) => x.serial),
          });
          lineCost = lineCost.plus(D(b.cost.toString()).mul(take));
          remaining = qty(D(remaining).minus(take));
          if (!remaining) break;
        }
        if (remaining)
          throw new Error("Insufficient sellable stock: " + m.name);
        subtotal = subtotal.plus(net);
        cogs = cogs.plus(lineCost);
        planned.push({
          ...l,
          factor: f,
          unitLabel: conversion.name,
          mrp: m.mrp,
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
      const netBase = money(subtotal.minus(p.discount));
      const tax = money(netBase.mul(Number(store.taxRate || 0)).div(100));
      const total = netBase.plus(tax);
      const inputs = p.payments || [
        {
          method: p.payment,
          amount: total.toFixed(2),
          tendered: p.tendered,
          reference: "",
          cardLastFour: "",
          terminal: "",
          remarks: "",
        },
      ];
      const settlement = await validatePayments(
        t,
        a,
        total,
        inputs,
        p.customerId,
      );
      const dueDate = new Date(
        Date.parse(today() + "T00:00:00Z") +
          (settlement.customer?.creditDays ?? 30) * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      const cashier = await t.user.findUnique({
        where: { id: a.id },
        select: { name: true },
      });
      const sale = await t.sale.create({
        data: {
          createdBy: a.id,
          total: total.toFixed(6),
          tax: tax.toFixed(6),
          cogs: cogs.toFixed(6),
          discount: p.discount,
          prescriptionReference: p.prescriptionReference,
          customerId: p.customerId,
          customerName: settlement.customer?.name || "",
          cashierName: cashier?.name || a.id,
          invoicePrefix: String(store.invoicePrefix || "MS"),
          notes: p.notes,
          creditAmount: settlement.credit.toFixed(6),
          dueDate: settlement.credit.gt(0) ? dueDate : null,
          payments: {
            create: inputs.map((x) => ({
              ...x,
              amount: x.amount,
              tendered:
                x.method === "CASH" ? (x.tendered ?? x.amount) : x.amount,
              paymentDate: x.paymentDate || today(),
              verification: "OPERATOR_RECORDED",
            })),
          },
        },
      });
      await recordCreditSale(
        t,
        a,
        sale.id,
        p.customerId,
        settlement.credit,
        settlement.advance,
        dueDate,
      );
      let allocatedTax = D(0),
        cumulativeTaxBase = D(0);
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
        const finalNet = l.net.minus(share);
        cumulativeTaxBase = cumulativeTaxBase.plus(finalNet);
        const lineTax =
          i === planned.length - 1
            ? tax.minus(allocatedTax)
            : netBase.isZero()
              ? D(0)
              : money(tax.mul(cumulativeTaxBase).div(netBase)).minus(
                  allocatedTax,
                );
        allocatedTax = allocatedTax.plus(lineTax);
        const line = await t.saleLine.create({
          data: {
            saleId: sale.id,
            medicineId: l.medicineId,
            name: l.name,
            unitLabel: l.unitLabel,
            mrp: l.mrp,
            unit: l.unit,
            factor: l.factor,
            quantity: l.quantity,
            price: l.price,
            discount: D(l.discount).plus(share).toFixed(6),
            net: l.net.minus(share).toFixed(6),
            cogs: l.cogs.toFixed(6),
            tax: lineTax.toFixed(6),
            allocations: { create: l.allocations },
          },
        });
        if (l.allocations.some((x) => x.serialNumbers.length)) {
          const created = await t.allocation.findMany({
            where: { saleLineId: line.id },
          });
          for (const allocation of created) {
            const names = allocation.serialNumbers as string[];
            if (names.length) {
              const updated = await t.stockSerial.updateMany({
                where: {
                  batchId: allocation.batchId,
                  serial: { in: names },
                  status: "AVAILABLE",
                },
                data: { status: "SOLD", allocationId: allocation.id },
              });
              if (updated.count !== names.length)
                throw new Error(
                  l.name + ": selected serial numbers are unavailable",
                );
            }
          }
        }
        for (const al of l.allocations)
          await move(t, a, al.batchId, -al.quantity, "SALE", sale.id);
      }
      if (p.draftId)
        await t.posDraft.update({
          where: { id: p.draftId },
          data: { status: "COMPLETED", version: { increment: 1 } },
        });
      await audit(t, a, "SALE_POST", sale.id);
      return {
        id: sale.id,
        number: sale.number,
        total: sale.total.toString(),
        change: settlement.change.toFixed(2),
        creditAmount: settlement.credit.toFixed(2),
        tax: tax.toFixed(2),
        warnings: validation.warnings,
      };
    }),
  );
}
const openingSchema = z.object({
  key: z.string().uuid(),
  medicineId: text,
  batchNumber: z.string().max(250).default(""),
  expiry: z.union([expiryDate, z.literal("")]).default(""),
  quantity,
  unit: text,
  unitCost: amount,
  reference: text,
  serialNumbers: z.array(text).max(10000).default([]),
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
      const identity = stockIdentity(m, p.batchNumber, p.expiry);
      p.batchNumber = identity.batchNumber;
      p.expiry = identity.expiry;
      const conversion = await resolveUnit(t, m, p.unit, p.quantity);
      const f = conversion.factor,
        n = conversion.quantity;
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
          mrp: m.mrp,
          cost: D(p.unitCost).div(f).toFixed(6),
        },
      });
      await receiveSerials(t, m, b.id, n, p.serialNumbers);
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
        .refine((v) => D(v).decimalPlaces() <= 6)
        .min(-100000000)
        .max(100000000)
        .refine((n) => n !== 0),
      reason: text,
      reference: text,
      serialNumbers: z.array(text).max(10000).default([]),
    })
    .parse(input);
  return transaction((t) =>
    once(t, p.key, { ...p, type: "adjust", actor: a.id }, async () => {
      const serialBatch = await t.batch.findUniqueOrThrow({
        where: { id: p.batchId },
        include: { medicine: true },
      });
      if (
        !serialBatch.medicine.fractionalAllowed &&
        !Number.isInteger(p.quantity)
      )
        throw new Error(
          serialBatch.medicine.name +
            ": fractional adjustment is not permitted",
        );
      if (serialBatch.medicine.serialTracked) {
        if (
          p.serialNumbers.length !== Math.abs(p.quantity) ||
          new Set(p.serialNumbers).size !== p.serialNumbers.length
        )
          throw new Error("Enter one serial per adjusted base unit");
        if (p.quantity > 0)
          await receiveSerials(
            t,
            serialBatch.medicine,
            p.batchId,
            p.quantity,
            p.serialNumbers,
          );
        else {
          const updated = await t.stockSerial.updateMany({
            where: {
              batchId: p.batchId,
              serial: { in: p.serialNumbers },
              status: { notIn: ["SOLD", "DISPOSED"] },
            },
            data: { status: "DISPOSED", allocationId: null },
          });
          if (updated.count !== p.serialNumbers.length)
            throw new Error("Serials do not match available stock");
        }
      }
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
    await t.stockSerial.updateMany({
      where: { batchId: id, status: { notIn: ["SOLD", "DISPOSED"] } },
      data: { status: status === "SELLABLE" ? "AVAILABLE" : status },
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
      quantity,
      reason: text,
      reference: text,
      serialNumbers: z.array(text).max(10000).default([]),
      refundMethod: z
        .enum(["CASH", "CARD", "TRANSFER", "ADVANCE"])
        .default("CASH"),
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
          if (
            D(p.quantity).gt(
              D(al.quantity.toString()).minus(al.returned.toString()),
            )
          )
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
            (sum, x) => qty(D(sum).plus(x.returned.toString())),
            0,
          );
          const refunded = prior.reduce(
            (sum, x) => sum.plus(x.amount.toString()),
            D(0),
          );
          const amount = money(
            D(al.saleLine.net.toString())
              .plus(al.saleLine.tax.toString())
              .mul(returned + p.quantity)
              .div(
                qty(
                  D(al.saleLine.quantity.toString()).mul(
                    al.saleLine.factor.toString(),
                  ),
                ),
              ),
          ).minus(refunded);
          const cogs = D(al.cost.toString()).mul(p.quantity);
          const priorTax = prior.reduce(
            (sum, x) => sum.plus(x.tax.toString()),
            D(0),
          );
          const returnTax = money(
            D(al.saleLine.tax.toString())
              .mul(returned + p.quantity)
              .div(
                qty(
                  D(al.saleLine.quantity.toString()).mul(
                    al.saleLine.factor.toString(),
                  ),
                ),
              ),
          ).minus(priorTax);
          const product = await t.medicine.findUniqueOrThrow({
            where: { id: al.saleLine.medicineId },
          });
          if (!product.fractionalAllowed && !Number.isInteger(p.quantity))
            throw new Error(
              product.name + ": fractional returns are not permitted",
            );
          if (product.serialTracked) {
            if (
              p.serialNumbers.length !== p.quantity ||
              new Set(p.serialNumbers).size !== p.serialNumbers.length
            )
              throw new Error("Select the exact returned serial numbers");
            const matches = await t.stockSerial.count({
              where: {
                allocationId: al.id,
                serial: { in: p.serialNumbers },
                status: "SOLD",
              },
            });
            if (matches !== p.serialNumbers.length)
              throw new Error(
                "Returned serial numbers do not match the original sale",
              );
          } else if (p.serialNumbers.length)
            throw new Error("Serial tracking is not enabled for this product");
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
                    mrp: al.batch.mrp,
                  },
                });
          const returnId = crypto.randomUUID();
          const financial = await creditReturn(
            t,
            a,
            al.saleLine.saleId,
            amount,
            returnId,
            p.refundMethod,
          );
          const r = await t.returnRecord.create({
            data: {
              id: returnId,
              type: "SALE",
              ...financial,
              tax: returnTax.toFixed(6),
              serialNumbers: p.serialNumbers,
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
          if (product.serialTracked)
            await t.stockSerial.updateMany({
              where: { allocationId: al.id, serial: { in: p.serialNumbers } },
              data: {
                batchId: b.id,
                status:
                  p.disposition === "SELLABLE" ? "AVAILABLE" : p.disposition,
                allocationId: null,
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
          D(p.quantity)
            .plus(old._sum.quantity?.toString() || 0)
            .gt(
              D(b.purchaseLine.quantity.toString())
                .plus(b.purchaseLine.bonus.toString())
                .mul(b.purchaseLine.factor.toString()),
            )
        )
          throw new Error("Return exceeds purchase quantity");
        const product = await t.medicine.findUniqueOrThrow({
          where: { id: b.medicineId },
        });
        if (!product.fractionalAllowed && !Number.isInteger(p.quantity))
          throw new Error(
            product.name + ": fractional returns are not permitted",
          );
        if (product.serialTracked) {
          if (
            p.serialNumbers.length !== p.quantity ||
            new Set(p.serialNumbers).size !== p.serialNumbers.length
          )
            throw new Error("Select the exact supplier-return serial numbers");
          const updated = await t.stockSerial.updateMany({
            where: {
              batchId: b.id,
              serial: { in: p.serialNumbers },
              status: { notIn: ["SOLD", "DISPOSED"] },
            },
            data: { status: "DISPOSED", allocationId: null },
          });
          if (updated.count !== p.serialNumbers.length)
            throw new Error("Supplier-return serials are unavailable");
        }
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
        const identity = stockIdentity(m, row.batchNumber, row.expiry);
        row.batchNumber = identity.batchNumber;
        row.expiry = identity.expiry;
        const conversion = await resolveUnit(t, m, row.unit, row.quantity);
        const f = conversion.factor,
          quantity = conversion.quantity;
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
            mrp: m.mrp,
            cost: D(row.unitCost).div(f).toFixed(6),
          },
        });
        await receiveSerials(t, m, b.id, quantity, row.serialNumbers);
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
