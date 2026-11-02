import { paymentSchema } from "./finance";
import { z } from "zod";
import {
  db,
  D,
  qty,
  transaction,
  audit,
  requireRole,
  managers,
  today,
  type Actor,
} from "./core";
import { resolveUnit } from "./catalogue";
export type CartIssue = {
  index: number;
  medicineId: string;
  product: string;
  code: string;
  message: string;
  available?: number;
  requested?: number;
  currentPrice?: string;
};
export class CartValidationError extends Error {
  constructor(public issues: CartIssue[]) {
    super(issues.map((i) => i.message).join("; "));
  }
}
export async function validateCart(
  t: any,
  lines: any[],
  prescriptionReference = "",
  store: any = {},
) {
  const issues: CartIssue[] = [],
    warnings: CartIssue[] = [],
    products: any[] = [];
  const reserved = new Map<string, number>();
  const reservedSerials = new Set<string>();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const m = await t.medicine.findUnique({
      where: { id: line.medicineId },
      include: { packaging: { include: { unit: true } } },
    });
    if (!m) {
      issues.push({
        index,
        medicineId: line.medicineId,
        product: "Unknown product",
        code: "MISSING",
        message: "This product no longer exists",
      });
      continue;
    }
    const issue = (code: string, message: string, extra: any = {}) =>
      issues.push({
        index,
        medicineId: m.id,
        product: m.name,
        code,
        message: m.name + ": " + message,
        ...extra,
      });
    if (!m.active) issue("INACTIVE", "product is inactive");
    if (m.prescription && !prescriptionReference.trim())
      issue("PRESCRIPTION", "Prescription reference required");
    if (
      store.allowLooseSales === false &&
      line.unit === "base" &&
      m.unitsPerStrip > 1
    )
      issue("UNIT", "Loose unit sales are disabled by store policy");
    let conversion;
    try {
      conversion = await resolveUnit(
        t,
        m,
        line.unit,
        Number(line.quantity),
        true,
      );
    } catch (e: any) {
      issue("UNIT", e.message);
      continue;
    }
    const gross = conversion.price.mul(line.quantity);
    const discount = D(line.discount || 0);
    if (discount.gt(gross))
      issue(
        "DISCOUNT",
        `Discount exceeds line value: requested PKR ${discount.toFixed(2)}, line value PKR ${gross.toFixed(2)}`,
      );
    const batches = await t.batch.findMany({
      where: {
        medicineId: m.id,
        status: "SELLABLE",
        expiry: { gte: today() },
        quantity: { gt: 0 },
      },
      orderBy: [{ expiry: "asc" }, { id: "asc" }],
    });
    const stock = batches.reduce(
      (s: any, b: any) => s.plus(b.quantity.toString()),
      D(0),
    );
    const available = qty(stock.minus(reserved.get(m.id) || 0));
    const requested = conversion.quantity;
    reserved.set(m.id, qty(D(reserved.get(m.id) || 0).plus(requested)));
    if (requested > available)
      issue(
        "STOCK",
        `Insufficient sellable stock. Requested quantity ${requested}, available sellable stock ${Math.max(0, available)}`,
        { available: Math.max(0, available), requested },
      );
    if (
      line.expectedPrice !== undefined &&
      !D(line.expectedPrice).eq(conversion.price)
    )
      issue(
        "PRICE",
        `Price changed from PKR ${line.expectedPrice} to PKR ${conversion.price.toFixed(2)}. Acknowledge the current price.`,
        { currentPrice: conversion.price.toFixed(6) },
      );
    if (
      m.mrp &&
      conversion.price.gt(D(m.mrp.toString()).mul(conversion.factor))
    )
      warnings.push({
        index,
        medicineId: m.id,
        product: m.name,
        code: "MRP",
        message: `${m.name}: Selling Price PKR ${conversion.price.toFixed(2)} exceeds configured MRP PKR ${D(m.mrp.toString()).mul(conversion.factor).toFixed(2)}. This warning is not a legal approval.`,
      });
    if (m.serialTracked) {
      const serials = line.serialNumbers || [];
      if (
        serials.some((serial: string) =>
          reservedSerials.has(m.id + ":" + serial),
        )
      )
        issue("SERIAL", "A serial number is selected on multiple cart rows");
      for (const serial of serials) reservedSerials.add(m.id + ":" + serial);
      if (
        serials.length !== requested ||
        new Set(serials).size !== serials.length
      )
        issue("SERIAL", `Select exactly ${requested} distinct serial numbers`);
      else {
        const count = await t.stockSerial.count({
          where: {
            medicineId: m.id,
            serial: { in: serials },
            status: "AVAILABLE",
            batch: {
              status: "SELLABLE",
              expiry: { gte: today() },
              quantity: { gt: 0 },
            },
          },
        });
        if (count !== serials.length)
          issue(
            "SERIAL",
            "One or more selected serial numbers are sold, restricted or expired",
          );
      }
    }
    const { purchasePrice, batches: _, ...safe } = m;
    products.push({
      ...safe,
      available: stock.toNumber(),
      nextExpiry: batches[0]?.expiry || null,
      currentPrice: conversion.price.toFixed(6),
      snapshotBatchIds: batches.map((b: any) => b.id),
    });
  }
  return { issues, warnings, products };
}
const draftData = z.object({
  lines: z
    .array(
      z.object({
        medicineId: z.string().min(1),
        unit: z.string().min(1),
        quantity: z.number().positive(),
        discount: z.union([z.string(), z.number()]).default("0"),
        expectedPrice: z.union([z.string(), z.number()]).optional(),
        serialNumbers: z.array(z.string()).default([]),
        snapshotBatchIds: z.array(z.string()).default([]),
      }),
    )
    .max(200),
  discount: z.union([z.string(), z.number()]).default("0"),
  customerId: z.string().nullable().optional(),
  payments: z
    .array(
      paymentSchema.extend({
        cardLastFour: z
          .string()
          .regex(/^\d{0,4}$/)
          .default(""),
      }),
    )
    .max(20)
    .default([]),
  payment: z.string().default("CASH"),
  tendered: z.union([z.string(), z.number()]).default("0"),
  prescriptionReference: z.string().max(250).default(""),
  notes: z.string().max(2000).default(""),
});
export async function draftList(a: Actor, all = false) {
  if (all) requireRole(a, managers);
  const rows = await db.posDraft.findMany({
    where: {
      ...(all ? {} : { ownerId: a.id }),
      status: { in: ["ACTIVE", "HELD"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const customers = await db.customer.findMany({
    where: {
      id: { in: rows.map((r) => r.customerId).filter((x): x is string => !!x) },
    },
    select: { id: true, name: true },
  });
  const owners = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.ownerId) } },
    select: { id: true, name: true },
  });
  return rows.map((r) => ({
    ...r,
    customerName:
      customers.find((c) => c.id === r.customerId)?.name || "Walk-in",
    cashierName: owners.find((c) => c.id === r.ownerId)?.name || r.ownerId,
    itemCount: (r.data as any).lines?.length || 0,
  }));
}
export async function saveDraft(a: Actor, input: unknown) {
  const p = z
    .object({
      id: z.string().uuid(),
      version: z.number().int().nonnegative(),
      status: z.enum(["ACTIVE", "HELD"]).default("ACTIVE"),
      data: draftData,
    })
    .parse(input);
  return transaction(async (t) => {
    const old = await t.posDraft.findUnique({ where: { id: p.id } });
    if (old && old.ownerId !== a.id) throw new Error("FORBIDDEN");
    if (old && ["COMPLETED", "DISCARDED"].includes(old.status))
      throw new Error("This draft is closed");
    if (old && old.version !== p.version) {
      if (
        JSON.stringify(old.data) === JSON.stringify(p.data) &&
        old.status === p.status
      )
        return old;
      throw new Error(
        "Draft changed in another window. Reload held sales before replacing it.",
      );
    }
    if (!old && p.version !== 0) throw new Error("Draft no longer exists");
    if (
      p.data.customerId &&
      !(await t.customer.count({
        where: { id: p.data.customerId, active: true },
      }))
    )
      throw new Error("Customer is inactive or unavailable");
    const record = old
      ? await t.posDraft.update({
          where: { id: p.id },
          data: {
            data: p.data as any,
            customerId: p.data.customerId,
            status: p.status,
            version: { increment: 1 },
          },
        })
      : await t.posDraft.create({
          data: {
            id: p.id,
            ownerId: a.id,
            customerId: p.data.customerId,
            data: p.data as any,
            status: p.status,
          },
        });
    if (p.status === "HELD")
      await audit(t, a, "SALE_HOLD", p.id, { items: p.data.lines.length });
    return record;
  });
}
export async function resumeDraft(a: Actor, id: string) {
  return transaction(async (t) => {
    const old = await t.posDraft.findUniqueOrThrow({ where: { id } });
    if (old.ownerId !== a.id) throw new Error("FORBIDDEN");
    if (!["ACTIVE", "HELD"].includes(old.status))
      throw new Error("This draft is closed");
    const data = draftData.parse(old.data);
    const store =
      (await t.settings.findUnique({ where: { id: "store" } }))?.data || {};
    const result = await validateCart(
      t,
      data.lines,
      data.prescriptionReference,
      store,
    );
    const record = await t.posDraft.update({
      where: { id },
      data: { status: "ACTIVE", version: { increment: 1 } },
    });
    await audit(t, a, "SALE_RESUME", id, { issues: result.issues.length });
    return { ...record, ...result };
  });
}
export async function discardDraft(a: Actor, id: string, version: number) {
  return transaction(async (t) => {
    const d = await t.posDraft.findUniqueOrThrow({ where: { id } });
    if (d.ownerId !== a.id) throw new Error("FORBIDDEN");
    if (d.status === "DISCARDED") return { ok: true };
    if (d.status === "COMPLETED")
      throw new Error("Posted sales cannot be discarded");
    if (d.version !== version)
      throw new Error("Draft changed; refresh before discarding");
    await t.posDraft.update({
      where: { id },
      data: { status: "DISCARDED", version: { increment: 1 } },
    });
    await audit(t, a, "DRAFT_DISCARD", id);
    return { ok: true };
  });
}
