import { Prisma, type Medicine } from "@prisma/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  db,
  D,
  qty,
  transaction,
  audit,
  requireRole,
  managers,
  type Actor,
} from "./core";
export const masterKinds = [
  "CATEGORY",
  "DOSAGE_FORM",
  "PRODUCT_TYPE",
  "UOM",
  "CUSTOMER_TYPE",
] as const;
const label = z.string().trim().min(1).max(150);
const masterSchema = z.object({
  kind: z.enum(masterKinds),
  name: label,
  active: z.boolean().default(true),
  data: z
    .object({
      pharmaceutical: z.boolean().optional(),
      requiresBatch: z.boolean().optional(),
      requiresExpiry: z.boolean().optional(),
      fractionalAllowed: z.boolean().optional(),
    })
    .default({}),
});
export async function masterUsage(
  t: Prisma.TransactionClient,
  id: string,
  kind: string,
) {
  const field = (
    {
      CATEGORY: "categoryId",
      DOSAGE_FORM: "dosageFormId",
      PRODUCT_TYPE: "productTypeId",
      UOM: "baseUnitId",
    } as Record<string, string>
  )[kind];
  let used = field
    ? await t.medicine.count({ where: { [field]: id } })
    : await t.customer.count({ where: { typeId: id } });
  if (kind === "UOM")
    used += await t.productUnit.count({ where: { unitId: id } });
  return used;
}
export async function listMaster(a: Actor, kind?: string, all = false) {
  if (kind) z.enum(masterKinds).parse(kind);
  if (all) requireRole(a, managers);
  const rows = await db.masterData.findMany({
    where: { ...(kind ? { kind } : {}), ...(all ? {} : { active: true }) },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return rows;
}
export async function saveMaster(a: Actor, input: unknown, id?: string) {
  requireRole(a, ["ADMIN"]);
  const p = masterSchema.parse(input);
  return transaction(async (t) => {
    if (id) {
      const old = await t.masterData.findUniqueOrThrow({ where: { id } });
      if (old.kind !== p.kind)
        throw new Error("Master-data kind cannot change");
      if (
        old.kind === "PRODUCT_TYPE" &&
        (await masterUsage(t, id, old.kind)) > 0 &&
        ["pharmaceutical", "requiresBatch", "requiresExpiry"].some(
          (k) => !!(old.data as any)?.[k] !== !!(p.data as any)?.[k],
        )
      )
        throw new Error(
          "Tracking policy is already used; create a new product type instead",
        );
    }
    const saved = id
      ? await t.masterData.update({
          where: { id },
          data: { ...p, nameKey: p.name.toLowerCase() },
        })
      : await t.masterData.create({
          data: { ...p, nameKey: p.name.toLowerCase() },
        });
    if (id && p.kind === "CATEGORY")
      await t.medicine.updateMany({
        where: { categoryId: id },
        data: { category: p.name },
      });
    if (id && p.kind === "DOSAGE_FORM")
      await t.medicine.updateMany({
        where: { dosageFormId: id },
        data: { form: p.name },
      });
    await audit(t, a, id ? "MASTER_UPDATE" : "MASTER_CREATE", saved.id, {
      ...p,
    });
    return saved;
  });
}
export async function deleteMaster(a: Actor, id: string) {
  requireRole(a, ["ADMIN"]);
  return transaction(async (t) => {
    const m = await t.masterData.findUniqueOrThrow({ where: { id } });
    if (await masterUsage(t, id, m.kind))
      throw new Error(
        `${m.name} is linked to existing products/customers or packaging. Deactivate it instead.`,
      );
    await t.masterData.delete({ where: { id } });
    await audit(t, a, "MASTER_DELETE", id, { name: m.name, kind: m.kind });
    return { ok: true };
  });
}
export const productFields = {
  barcodeType: z.enum(["CODE128", "EAN13", "EAN8", "UPC_A"]).default("CODE128"),
  categoryId: z.string().nullable().optional(),
  dosageFormId: z.string().nullable().optional(),
  productTypeId: z.string().nullable().optional(),
  baseUnitId: z.string().nullable().optional(),
  brand: z.string().max(150).default(""),
  specification: z.string().max(500).default(""),
  model: z.string().max(150).default(""),
  warranty: z.string().max(500).default(""),
  batchTracked: z.boolean().optional(),
  expiryTracked: z.boolean().optional(),
  serialTracked: z.boolean().default(false),
  fractionalAllowed: z.boolean().default(false),
  packaging: z
    .array(
      z.object({
        unitId: label,
        factor: z
          .union([z.number(), z.string()])
          .transform(String)
          .refine(
            (v) =>
              D(v).gt(0) && D(v).lte(10000000) && D(v).decimalPlaces() <= 6,
            "Invalid conversion factor",
          ),
        salePrice: z.union([z.number(), z.string()]).nullable().optional(),
        fractionalAllowed: z.boolean().default(false),
      }),
    )
    .max(30)
    .default([]),
};
export async function prepareProduct(
  t: Prisma.TransactionClient,
  data: any,
  old?: Medicine,
) {
  const { packaging, ...p } = data;
  async function ref(
    kind: string,
    id: string | null | undefined,
    name: string,
    oldId?: string | null,
  ) {
    if (!id && !name) return null;
    const row = id
      ? await t.masterData.findUnique({ where: { id } })
      : await t.masterData.findUnique({
          where: { kind_nameKey: { kind, nameKey: name.trim().toLowerCase() } },
        });
    if (!row || row.kind !== kind)
      throw new Error(
        `${kind.replaceAll("_", " ")} must be selected from configured master data`,
      );
    if (!row.active && row.id !== oldId)
      throw new Error(row.name + " is inactive");
    return row;
  }
  const category = await ref(
    "CATEGORY",
    p.categoryId,
    p.category,
    old?.categoryId,
  );
  const dosage = await ref(
    "DOSAGE_FORM",
    p.dosageFormId,
    p.form,
    old?.dosageFormId,
  );
  const type = await ref(
    "PRODUCT_TYPE",
    p.productTypeId,
    p.productTypeId ? "" : "Medicine",
    old?.productTypeId,
  );
  const base = await ref("UOM", p.baseUnitId, p.baseUnit, old?.baseUnitId);
  const policy = (type?.data as any) || {};
  if (policy.pharmaceutical && !dosage)
    throw new Error(
      "A dosage form is required for this pharmaceutical product type",
    );
  p.categoryId = category?.id || null;
  p.category = category?.name || "";
  p.dosageFormId = dosage?.id || null;
  p.form = dosage?.name || "";
  p.productTypeId = type?.id || null;
  p.baseUnitId = base?.id || null;
  p.baseUnit =
    old && old.baseUnitId === base?.id
      ? old.baseUnit
      : base?.name || p.baseUnit;
  p.batchTracked = policy.requiresBatch ? true : (p.batchTracked ?? false);
  p.expiryTracked = policy.requiresExpiry ? true : (p.expiryTracked ?? false);
  if (p.serialTracked && p.fractionalAllowed)
    throw new Error(
      "Serial-tracked products cannot use fractional base quantities",
    );
  if (p.barcode && p.barcodeType !== "CODE128") {
    const lengths: Record<string, number> = { EAN13: 13, EAN8: 8, UPC_A: 12 };
    if (!/^\d+$/.test(p.barcode) || p.barcode.length !== lengths[p.barcodeType])
      throw new Error("Invalid " + p.barcodeType + " barcode length/format");
    const digits = p.barcode.slice(0, -1).split("").reverse();
    const sum = digits.reduce(
      (n: string | number, v: string, i: number) =>
        Number(n) + Number(v) * (i % 2 === 0 ? 3 : 1),
      0,
    );
    if ((10 - (Number(sum) % 10)) % 10 !== Number(p.barcode.at(-1)))
      throw new Error("Barcode check digit is invalid");
  }
  if (p.barcode && !/^[\x21-\x7e]{1,100}$/.test(p.barcode))
    throw new Error(
      "Barcode must use 1–100 printable non-space ASCII characters (keyboard/Code 128 compatible)",
    );
  const units = [];
  const seen = new Set<string>();
  for (const u of packaging) {
    if (seen.has(u.unitId)) throw new Error("Duplicate packaging unit");
    seen.add(u.unitId);
    const unit = await ref("UOM", u.unitId, "", u.unitId);
    if (!unit?.active) throw new Error("Packaging unit is inactive");
    const factor = D(u.factor);
    if (u.unitId === base?.id && !factor.eq(1))
      throw new Error("Base unit conversion must equal one");
    const price =
      u.salePrice === null || u.salePrice === undefined || u.salePrice === ""
        ? null
        : D(u.salePrice);
    if (
      price &&
      (price.lt(0) || price.decimalPlaces() > 6 || price.gt("9999999999"))
    )
      throw new Error("Invalid unit selling price");
    units.push({
      unitId: u.unitId,
      factor: factor.toFixed(6),
      salePrice: price?.toFixed(6) || null,
      fractionalAllowed: u.fractionalAllowed,
    });
  }
  if (old && (await t.batch.count({ where: { medicineId: old.id } }))) {
    for (const key of [
      "batchTracked",
      "expiryTracked",
      "serialTracked",
      "fractionalAllowed",
      "baseUnitId",
    ] as const)
      if (old[key] !== p[key])
        throw new Error(
          "Product tracking/base-unit policy is immutable after inventory history exists",
        );
    const previous = await t.productUnit.findMany({
      where: { medicineId: old.id },
      orderBy: { unitId: "asc" },
    });
    const signatures = (rows: any[]) =>
      JSON.stringify(
        rows
          .map((u) => ({
            unitId: u.unitId,
            factor: D(u.factor.toString()).toFixed(6),
            fractionalAllowed: u.fractionalAllowed,
          }))
          .sort((a, b) => a.unitId.localeCompare(b.unitId)),
      );
    if (signatures(previous) !== signatures(units))
      throw new Error(
        "Packaging conversions are immutable after inventory history exists; prices can still change",
      );
  }
  for (const key of ["purchaseUnit", "sellingUnit"])
    if (
      !["base", "strip", "box"].includes(p[key]) &&
      !units.some((u) => u.unitId === p[key])
    )
      throw new Error("Default " + key + " must be a configured product unit");
  return { data: p, units };
}
export async function productUnits(t: Prisma.TransactionClient, m: Medicine) {
  const rows = await t.productUnit.findMany({
    where: { medicineId: m.id },
    include: { unit: true },
  });
  return rows;
}
export async function resolveUnit(
  t: Prisma.TransactionClient,
  m: Medicine,
  key: string,
  quantity: number,
  selling = false,
) {
  let factor = D(1),
    name = m.baseUnit,
    price = D(m.salePrice.toString()),
    fractional = m.fractionalAllowed;
  if (["base", "strip", "box"].includes(key)) {
    if (selling && key === "base" && !m.looseAllowed)
      throw new Error(`${m.name}: Loose unit sales are disabled`);
    factor = D(
      key === "box"
        ? m.unitsPerStrip * m.stripsPerBox
        : key === "strip"
          ? m.unitsPerStrip
          : 1,
    );
    name = key === "base" ? m.baseUnit : key;
    price = D(
      (key === "box"
        ? (m.boxPrice ?? m.salePrice.mul(factor.toString()))
        : key === "strip"
          ? (m.stripPrice ?? m.salePrice.mul(factor.toString()))
          : m.salePrice
      ).toString(),
    );
  } else {
    const u = await t.productUnit.findUnique({
      where: { medicineId_unitId: { medicineId: m.id, unitId: key } },
      include: { unit: true },
    });
    if (!u || !u.unit.active)
      throw new Error(`${m.name}: selected unit is unavailable`);
    factor = D(u.factor.toString());
    name = u.unit.name;
    price = D(
      u.salePrice?.toString() ??
        D(m.salePrice.toString()).mul(factor).toString(),
    );
    fractional = m.fractionalAllowed && u.fractionalAllowed;
  }
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    D(quantity).decimalPlaces() > 6 ||
    (!Number.isInteger(quantity) && !fractional)
  )
    throw new Error(
      `${m.name}: fractional quantity is not permitted for ${name}`,
    );
  const base = factor.mul(quantity);
  if (
    base.gt(100000000) ||
    base.decimalPlaces() > 6 ||
    (!m.fractionalAllowed && !base.isInteger()) ||
    (m.serialTracked && !base.isInteger())
  )
    throw new Error(`${m.name}: invalid base-unit quantity or conversion`);
  return { factor: factor.toNumber(), quantity: qty(base), price, name };
}
export function stockIdentity(
  m: Medicine,
  batchNumber: string | undefined,
  expiry: string | undefined,
) {
  if (m.batchTracked && !batchNumber?.trim())
    throw new Error(`${m.name}: batch/lot number is required`);
  if (m.expiryTracked && !expiry)
    throw new Error(`${m.name}: expiry date is required`);
  return {
    batchNumber: batchNumber?.trim() || "LOT-" + randomUUID(),
    expiry: expiry || "9999-12-31",
  };
}
export async function receiveSerials(
  t: Prisma.TransactionClient,
  m: Medicine,
  batchId: string,
  quantity: number,
  serials: string[] = [],
) {
  if (!m.serialTracked) {
    if (serials.length)
      throw new Error(`${m.name}: serial tracking is not enabled`);
    return;
  }
  if (serials.length !== quantity || new Set(serials).size !== serials.length)
    throw new Error(
      `${m.name}: enter exactly ${quantity} distinct serial numbers`,
    );
  const batch = await t.batch.findUniqueOrThrow({ where: { id: batchId } });
  for (const serial of serials)
    await t.stockSerial.create({
      data: {
        medicineId: m.id,
        batchId,
        serial,
        status: batch.status === "SELLABLE" ? "AVAILABLE" : batch.status,
      },
    });
}
