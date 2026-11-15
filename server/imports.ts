import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db, D, transaction, requireRole, audit, once, today } from "./core";
import { normalizeName } from "../shared/business";
import { importFields, normalizeImportRow } from "../shared/imports";
import { medicineSchema, opening, savePurchase, postPurchase } from "./engine";
import { prepareProduct, resolveUnit, stockIdentity } from "./catalogue";
import { ledger } from "./finance";
const json = (x: any) => JSON.parse(JSON.stringify(x));
async function product(t: any, p: any) {
  const rows = await t.medicine.findMany({
    where: p.medicineId
      ? { id: p.medicineId }
      : p.code
        ? { code: Number(p.code) }
        : { name: { equals: p.name, mode: "insensitive" } },
  });
  if (rows.length !== 1)
    throw new Error(
      "Product mapping missing or ambiguous; use exact product ID/code",
    );
  return rows[0];
}
async function party(t: any, kind: string, p: any) {
  const table = Prisma.raw(kind === "customer" ? '"Customer"' : '"Supplier"');
  const ids: any[] = await t.$queryRaw(
    Prisma.sql`SELECT id FROM ${table} WHERE lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))=${normalizeName(p.name)}`,
  );
  const rows = await t[kind].findMany({
    where: { id: { in: ids.map((x) => x.id) } },
  });
  const found = rows.filter(
    (x: any) => normalizeName(x.name) === normalizeName(p.name),
  );
  if (found.length > 1)
    throw new Error("Ambiguous name; review matching records");
  return found[0];
}
async function inspect(t: any, kind: string, p: any, options: any) {
  let duplicate: any = null;
  if (kind === "catalogue") {
    medicineSchema.parse(p);
    const ids: any[] =
      await t.$queryRaw`SELECT id FROM "Medicine" WHERE lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))=${normalizeName(p.name)} OR (barcode=${p.barcode || ""} AND barcode<>'')`;
    const rows = await t.medicine.findMany({
      where: { id: { in: ids.map((x) => x.id) } },
      include: { packaging: true },
    });
    const candidates = rows.filter(
      (m: any) =>
        normalizeName(m.name) === normalizeName(p.name) &&
        normalizeName(m.strength) === normalizeName(p.strength) &&
        normalizeName(m.manufacturer) === normalizeName(p.manufacturer) &&
        normalizeName(m.brand) === normalizeName(p.brand) &&
        (!p.form || normalizeName(m.form) === normalizeName(p.form)) &&
        (!p.baseUnit ||
          normalizeName(m.baseUnit) === normalizeName(p.baseUnit)),
    );
    if (candidates.length > 1 && !p.barcode)
      throw new Error(
        "Multiple product variants match; provide a barcode, dosage form and packaging unit for review",
      );
    duplicate =
      rows.find((m: any) => p.barcode && m.barcode === p.barcode) ||
      rows.find(
        (m: any) =>
          normalizeName(m.name) === normalizeName(p.name) &&
          normalizeName(m.strength) === normalizeName(p.strength) &&
          normalizeName(m.manufacturer) === normalizeName(p.manufacturer) &&
          normalizeName(m.brand) === normalizeName(p.brand) &&
          (!p.form || normalizeName(m.form) === normalizeName(p.form)) &&
          (!p.baseUnit ||
            normalizeName(m.baseUnit) === normalizeName(p.baseUnit)),
      );
    const categories = await t.masterData.findMany({
      where: { kind: "CATEGORY" },
    });
    if (
      !categories.some(
        (c: any) => normalizeName(c.name) === normalizeName(p.category),
      ) &&
      !options.createCategories
    )
      throw new Error("New category requires confirmation: " + p.category);
  } else if (kind === "customers" || kind === "suppliers") {
    const model = kind === "customers" ? "customer" : "supplier";
    duplicate = await party(t, model, p);
    if (model === "customer" && p.mobile) {
      const ids: any[] =
        await t.$queryRaw`SELECT id FROM "Customer" WHERE regexp_replace(regexp_replace(regexp_replace(mobile,'[^0-9]','','g'),'^00',''),'^0','92')=${p.mobile}`;
      const rows = await t.customer.findMany({
        where: { id: { in: ids.map((x) => x.id) } },
      });
      if (rows.length > 1)
        throw new Error("Multiple customers share this phone; review manually");
      const match = rows.find(
        (c: any) =>
          String(c.mobile).replace(/\D/g, "").replace(/^0/, "92") === p.mobile,
      );
      if (match) duplicate = match;
    }
  } else if (kind.endsWith("balances")) {
    const c = await party(
      t,
      kind === "customer-balances" ? "customer" : "supplier",
      p,
    );
    if (!c) throw new Error("Create the customer/supplier first");
    if (
      kind === "customer-balances" &&
      (await t.customerLedger.count({ where: { customerId: c.id } }))
    )
      throw new Error(
        "Existing customer ledger cannot be overwritten by an opening balance",
      );
    if (
      kind === "supplier-balances" &&
      (!D(c.openingPayable).isZero() ||
        (await t.historicalInvoice.count({
          where: { kind: "SUPPLIER_OPENING", partyId: c.id },
        })))
    )
      throw new Error("Supplier opening payable already exists");
  } else if (kind === "stock") {
    const m = await product(t, p);
    stockIdentity(m, p.batchNumber, p.expiry);
    await resolveUnit(t, m, p.unit, p.quantity);
    if (m.serialTracked)
      throw new Error(
        "Serial stock must be entered using Inventory with serial numbers",
      );
    if (m.expiryTracked && p.expiry <= today())
      throw new Error(
        "Opening stock is expired; enter explicitly in Inventory as unavailable stock",
      );
    if (
      await t.movement.findFirst({
        where: {
          type: "OPENING",
          reference: p.reference,
          batch: {
            medicineId: m.id,
            number: p.batchNumber || "",
            expiry: p.expiry || "9999-12-31",
          },
        },
      })
    )
      throw new Error("Opening reference/product/batch already posted");
  } else if (kind === "purchases" || kind === "sales") {
    const model = kind === "purchases" ? "supplier" : "customer",
      name = kind === "purchases" ? p.supplier : p.customer;
    if (!name) throw new Error(model + " required for historical records");
    const c = await party(t, model, { name });
    if (!c) throw new Error(model + " mapping missing");
    const m = await product(t, p);
    await resolveUnit(t, m, p.unit, p.quantity);
    if (p.date > today())
      throw new Error("Historical date cannot be in the future");
    if (kind === "purchases" && p.unitCost === undefined)
      throw new Error("Purchase cost is required");
    if (kind === "sales" && p.salePrice === undefined)
      throw new Error("Historical selling price is required");
    if (
      await t.historicalInvoice.findUnique({
        where: {
          kind_partyId_reference: {
            kind,
            partyId: c.id,
            reference: p.reference,
          },
        },
      })
    )
      throw new Error("Historical invoice already imported");
    if (
      kind === "purchases" &&
      (await t.purchase.findUnique({
        where: {
          supplierId_supplierInvoice: {
            supplierId: c.id,
            supplierInvoice: p.reference,
          },
        },
      }))
    )
      throw new Error("Purchase invoice already exists");
    if (options.stockImpact) {
      stockIdentity(m, p.batchNumber, p.expiry);
      if (kind !== "purchases")
        throw new Error(
          "Historical sales are records-only to avoid altering current stock and debt",
        );
      if (p.tax)
        throw new Error(
          "Stock-impacting purchase tax is not supported by the purchase model; use records-only",
        );
      if (m.serialTracked)
        throw new Error("Serial purchases require normal purchase entry");
      if (p.salePrice === undefined)
        throw new Error("Selling price required for stock-impacting purchase");
    }
  }
  return duplicate;
}
export async function previewImport(a: any, input: any) {
  requireRole(a, ["ADMIN"]);
  const kind = String(input.kind);
  if (!importFields[kind]) throw new Error("Unsupported import type");
  if (
    !Array.isArray(input.rows) ||
    input.rows.length < 1 ||
    input.rows.length > 2000
  )
    throw new Error("Import 1–2000 rows at a time");
  const options = {
    duplicates: input.options?.duplicates || "review",
    createCategories: !!input.options?.createCategories,
    stockImpact: !!input.options?.stockImpact,
  };
  if (!["review", "skip", "update"].includes(options.duplicates))
    throw new Error("Invalid duplicate policy");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ kind, rows: input.rows, options }))
    .digest("hex");
  return transaction(async (t) => {
    const existing = await t.importJob.findUnique({ where: { fingerprint } });
    if (existing) return existing;
    const country =
      ((await t.settings.findUnique({ where: { id: "store" } }))?.data as any)
        ?.reminderCountryCode || "92";
    const rows: any[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < input.rows.length; i++) {
      let p: any = {},
        error = "",
        duplicate: any = null;
      try {
        p = normalizeImportRow(input.rows[i], kind, country);
        duplicate = await inspect(t, kind, p, options);
        const key = ["purchases", "sales"].includes(kind)
          ? ""
          : kind === "stock"
            ? JSON.stringify([
                p.medicineId || p.code || normalizeName(p.name),
                p.reference,
                p.batchNumber,
                p.expiry,
              ])
            : JSON.stringify([
                normalizeName(p.name),
                p.mobile || "",
                p.strength || "",
                p.manufacturer || "",
                p.brand || "",
                p.form || "",
                p.baseUnit || "",
              ]);
        if (key && seen.has(key)) throw new Error("Duplicate row in this file");
        if (key) seen.add(key);
        if (
          duplicate &&
          options.duplicates === "update" &&
          kind === "catalogue" &&
          p.barcode &&
          (normalizeName(duplicate.name) !== normalizeName(p.name) ||
            normalizeName(duplicate.strength) !== normalizeName(p.strength) ||
            normalizeName(duplicate.brand) !== normalizeName(p.brand))
        )
          throw new Error(
            "Barcode belongs to a different product variant; review manually",
          );
      } catch (e: any) {
        error = e.message;
      }
      rows.push({
        row: i + 2,
        source: json(input.rows[i]),
        payload: p,
        error,
        duplicateId: duplicate?.id || null,
        status: error
          ? "INVALID"
          : duplicate
            ? options.duplicates === "update"
              ? "UPDATE"
              : options.duplicates === "skip"
                ? "SKIP"
                : "REVIEW"
            : "NEW",
        key: randomUUID(),
      });
    }
    if (["purchases", "sales"].includes(kind)) {
      const groups = new Map<string, any[]>();
      for (const row of rows) {
        const p = row.payload,
          k = JSON.stringify([p.supplier || p.customer, p.reference]);
        groups.set(k, [...(groups.get(k) || []), row]);
      }
      for (const group of groups.values()) {
        const p = group[0].payload;
        const expected = group.reduce(
          (n, r) =>
            n
              .plus(
                D(r.payload.quantity || 0).mul(
                  r.payload.unitCost ?? r.payload.salePrice ?? 0,
                ),
              )
              .minus(r.payload.discount || 0)
              .plus(r.payload.tax || 0),
          D(0),
        );
        const invalid =
          group.some(
            (r) =>
              r.error ||
              r.payload.date !== p.date ||
              r.payload.total !== p.total,
          ) || !expected.toDecimalPlaces(2).eq(p.total ?? -1);
        if (invalid)
          for (const r of group) {
            r.error =
              "Invoice group has invalid rows, inconsistent dates/totals, or line totals do not reconcile";
            r.status = "INVALID";
          }
      }
    }
    const job = await t.importJob.create({
      data: {
        fingerprint,
        kind,
        filename: String(input.filename || "Import").slice(0, 200),
        options,
        rows: json(rows),
        createdBy: a.id,
      },
    });
    await audit(t, a, "IMPORT_PREVIEW", job.id, { kind, rows: rows.length });
    return job;
  });
}
async function commitMaster(
  t: any,
  a: any,
  kind: string,
  p: any,
  options: any,
  key: string,
) {
  const duplicate = await inspect(t, kind, p, options);
  if (duplicate && options.duplicates !== "update")
    return { status: "SKIPPED" };
  if (kind === "catalogue") {
    const categories = await t.masterData.findMany({
      where: { kind: "CATEGORY" },
    });
    let category = categories.find(
      (c: any) => normalizeName(c.name) === normalizeName(p.category),
    );
    if (!category)
      category = await t.masterData.create({
        data: {
          kind: "CATEGORY",
          name: p.category.trim().replace(/\s+/g, " "),
          nameKey: normalizeName(p.category),
        },
      });
    const incompleteFields = [
      "purchasePrice",
      "salePrice",
      "form",
      "baseUnit",
      "unitsPerStrip",
      "stripsPerBox",
    ].filter((f) => p[f] === undefined);
    const parsed = medicineSchema.parse({
      ...(duplicate ? json(duplicate) : {}),
      ...p,
      category: category.name,
      categoryId: category.id,
      incompleteFields: duplicate
        ? ((duplicate.incompleteFields as string[]) || []).filter(
            (f) => p[f] === undefined,
          )
        : incompleteFields,
    });
    const prepared = await prepareProduct(t, parsed, duplicate);
    let m;
    if (duplicate)
      m = await t.medicine.update({
        where: { id: duplicate.id },
        data: prepared.data,
      });
    else
      m = await t.medicine.create({
        data: { ...prepared.data, packaging: { create: prepared.units } },
      });
    await audit(t, a, "CATALOGUE_IMPORT", m.id, {
      jobRow: key,
      incompleteFields: m.incompleteFields,
    });
    return { status: duplicate ? "UPDATED" : "IMPORTED", id: m.id };
  }
  if (kind === "customers" || kind === "suppliers") {
    const { openingBalance, ...data } = p;
    let c;
    if (kind === "customers") {
      const fields = data;
      c = duplicate
        ? await t.customer.update({
            where: { id: duplicate.id },
            data: {
              name: fields.name,
              mobile: fields.mobile,
              ...(fields.email !== undefined ? { email: fields.email } : {}),
              ...(fields.address !== undefined
                ? { address: fields.address }
                : {}),
              ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
            },
          })
        : await t.customer.create({
            data: {
              ...fields,
              openingOutstanding: String(openingBalance || 0),
            },
          });
      if (duplicate && openingBalance)
        throw new Error(
          "Updates cannot overwrite opening balances; use a separate opening import on an empty ledger",
        );
      if (!duplicate && openingBalance)
        await ledger(
          t,
          a,
          c.id,
          "OPENING",
          key,
          String(openingBalance),
          0,
          undefined,
          undefined,
          "Imported authorized opening balance",
        );
    } else {
      c = duplicate
        ? await t.supplier.update({ where: { id: duplicate.id }, data })
        : await t.supplier.create({
            data: { ...data, openingPayable: String(openingBalance || 0) },
          });
      if (duplicate && openingBalance)
        throw new Error("Updates cannot overwrite opening payables");
      if (!duplicate && openingBalance)
        await t.historicalInvoice.create({
          data: {
            kind: "SUPPLIER_OPENING",
            partyId: c.id,
            reference: key,
            date: today(),
            total: String(openingBalance),
            data: json(p),
            createdBy: a.id,
          },
        });
    }
    await audit(t, a, "MASTER_IMPORT", c.id, { kind, ...p });
    return { status: duplicate ? "UPDATED" : "IMPORTED", id: c.id };
  }
  if (kind.endsWith("balances")) {
    if (p.date > today())
      throw new Error("Opening date cannot be in the future");
    const customer = kind === "customer-balances",
      c = await party(t, customer ? "customer" : "supplier", p);
    if (customer) {
      await t.customer.update({
        where: { id: c.id },
        data: { openingOutstanding: String(p.openingBalance) },
      });
      await ledger(
        t,
        a,
        c.id,
        "OPENING",
        p.reference,
        String(p.openingBalance),
        0,
        undefined,
        undefined,
        "Authorized imported opening",
        new Date(p.date + "T12:00:00+05:00"),
      );
    } else {
      await t.supplier.update({
        where: { id: c.id },
        data: { openingPayable: String(p.openingBalance) },
      });
      await t.historicalInvoice.create({
        data: {
          kind: "SUPPLIER_OPENING",
          partyId: c.id,
          reference: p.reference,
          date: p.date,
          total: String(p.openingBalance),
          data: json(p),
          createdBy: a.id,
        },
      });
    }
    await audit(t, a, "OPENING_BALANCE_IMPORT", c.id, p);
    return { status: "IMPORTED", id: c.id };
  }
  throw new Error("Unsupported master import");
}
export async function commitImport(a: any, id: string, confirmation: any) {
  requireRole(a, ["ADMIN"]);
  const job = await db.importJob.findUniqueOrThrow({ where: { id } }),
    options = job.options as any,
    rows = job.rows as any[];
  if (options.stockImpact && !confirmation.confirmStockImpact)
    throw new Error(
      "Explicit stock-impact confirmation required; do not combine these purchases with opening stock for the same inventory",
    );
  const groups = ["purchases", "sales"].includes(job.kind)
    ? Array.from(
        rows
          .reduce((map: Map<string, any[]>, r: any) => {
            const p = r.payload,
              k = JSON.stringify([p.supplier || p.customer, p.reference]);
            map.set(k, [...(map.get(k) || []), r]);
            return map;
          }, new Map())
          .values(),
      )
    : rows.map((r) => [r]);
  for (const group of groups as any[][]) {
    const row = group[0],
      p = row.payload,
      key = row.key;
    if (group.some((r) => ["INVALID", "SKIP", "REVIEW"].includes(r.status)))
      continue;
    const previous = await db.importRow.findUnique({
      where: { jobId_rowNumber: { jobId: id, rowNumber: row.row } },
    });
    if (
      previous?.status === "IMPORTED" ||
      previous?.status === "UPDATED" ||
      previous?.status === "SKIPPED"
    )
      continue;
    try {
      let result: any;
      if (job.kind === "stock") {
        // Existing opening operation is atomic and idempotent, including crash recovery before history is saved.
        const m = await product(db, p);
        const b = await opening(a, {
          key,
          medicineId: m.id,
          batchNumber: p.batchNumber || "",
          expiry: p.expiry || "",
          quantity: p.quantity,
          unit: p.unit,
          unitCost: String(p.unitCost),
          reference: p.reference,
          openingDate: p.date,
          importGuard: true,
        });
        result = { status: "IMPORTED", id: b.id };
      } else if (["purchases", "sales"].includes(job.kind)) {
        const partyRow = await party(
          db,
          job.kind === "purchases" ? "supplier" : "customer",
          { name: p.supplier || p.customer },
        );
        if (options.stockImpact) {
          let purchase = await db.purchase.findUnique({
            where: {
              supplierId_supplierInvoice: {
                supplierId: partyRow.id,
                supplierInvoice: p.reference,
              },
            },
          });
          if (purchase && purchase.remarks !== `Import ${id}:${row.row}`)
            throw new Error("Invoice already exists outside this import");
          if (!purchase) {
            const lines = [];
            for (const r of group) {
              const x = r.payload,
                m = await product(db, x);
              lines.push({
                medicineId: m.id,
                batchNumber: x.batchNumber || "",
                expiry: x.expiry || "",
                quantity: x.quantity,
                unit: x.unit,
                unitCost: String(x.unitCost),
                sellingPrice: String(x.salePrice),
                discount: String(x.discount || 0),
              });
            }
            purchase = await savePurchase(a, {
              supplierId: partyRow.id,
              supplierInvoice: p.reference,
              invoiceDate: p.date,
              receivingDate: p.date,
              remarks: `Import ${id}:${row.row}`,
              lines,
            });
          }
          if (purchase.status !== "POSTED")
            await postPurchase(a, purchase.id, key, [], true);
          result = { status: "IMPORTED", id: purchase.id };
        } else
          result = await transaction((t) =>
            once(t, key, { job: id, row: row.row }, async () => {
              for (const r of group)
                await inspect(t, job.kind, r.payload, options);
              const h = await t.historicalInvoice.create({
                data: {
                  kind: job.kind,
                  partyId: partyRow.id,
                  reference: p.reference,
                  date: p.date,
                  total: String(p.total),
                  data: json(group.map((r) => r.payload)),
                  createdBy: a.id,
                },
              });
              await audit(t, a, "HISTORICAL_RECORD_IMPORT", h.id, {
                job: id,
                stockImpact: false,
                financialImpact: false,
              });
              return { status: "IMPORTED", id: h.id };
            }),
          );
      } else
        result = await transaction((t) =>
          once(t, key, { job: id, row: row.row }, () =>
            commitMaster(t, a, job.kind, p, options, key),
          ),
        );
      await transaction(async (t) => {
        for (const r of group)
          await t.importRow.upsert({
            where: { jobId_rowNumber: { jobId: id, rowNumber: r.row } },
            create: {
              jobId: id,
              rowNumber: r.row,
              status: result.status,
              payload: json(r.payload),
              result: json(result),
            },
            update: { status: result.status, result: json(result) },
          });
      });
    } catch (e: any) {
      for (const r of group)
        await db.importRow.upsert({
          where: { jobId_rowNumber: { jobId: id, rowNumber: r.row } },
          create: {
            jobId: id,
            rowNumber: r.row,
            status: "FAILED",
            payload: json(r.payload),
            result: { error: e.message },
          },
          update: { status: "FAILED", result: { error: e.message } },
        });
    }
  }
  const results = await db.importRow.findMany({ where: { jobId: id } });
  const summary = {
    successful: results.filter((r) =>
      ["IMPORTED", "UPDATED"].includes(r.status),
    ).length,
    skipped:
      rows.filter((r) => ["INVALID", "SKIP", "REVIEW"].includes(r.status))
        .length + results.filter((r) => r.status === "SKIPPED").length,
    failed: results.filter((r) => r.status === "FAILED").length,
    results,
  };
  await transaction(async (t) => {
    await t.importJob.update({
      where: { id },
      data: {
        status: summary.failed ? "PARTIAL" : "COMPLETE",
        result: json(summary),
      },
    });
    await audit(t, a, "IMPORT_COMMIT", id, {
      successful: summary.successful,
      skipped: summary.skipped,
      failed: summary.failed,
    });
  });
  return summary;
}
export function registerImportRoutes(route: any, actor: any) {
  route("post", "/imports/preview", (r: any) =>
    previewImport(actor(r), r.body),
  );
  route("post", "/imports/:id/commit", (r: any) =>
    commitImport(actor(r), String(r.params.id), r.body),
  );
  route("get", "/imports", async (r: any) => {
    requireRole(actor(r), ["ADMIN"]);
    return db.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  });
  route("get", "/imports/history-records", async (r: any) => {
    requireRole(actor(r), ["ADMIN"]);
    return db.historicalInvoice.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  });
  route("get", "/import-mappings", async (r: any) => {
    requireRole(actor(r), ["ADMIN"]);
    return db.mappingProfile.findMany({ orderBy: { name: "asc" } });
  });
  route("post", "/import-mappings", async (r: any) => {
    requireRole(actor(r), ["ADMIN"]);
    const { name, kind, mapping } = r.body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100 ||
      !importFields[kind] ||
      !mapping ||
      typeof mapping !== "object"
    )
      throw new Error("Invalid mapping profile");
    return db.mappingProfile.upsert({
      where: { name: name.trim() },
      create: { name: name.trim(), kind, mapping: json(mapping) },
      update: { kind, mapping: json(mapping) },
    });
  });
}
