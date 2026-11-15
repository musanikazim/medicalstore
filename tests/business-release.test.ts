import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mobileNumber,
  reminderMessage,
  reminderTemplates,
} from "../shared/business";
import { normalizeImportRow, suggestMapping } from "../shared/imports";
import { parseCsv } from "../shared/csv";
if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("Dedicated TEST_DATABASE_URL ending in _test required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const E = await import("../server/engine"),
  F = await import("../server/finance"),
  I = await import("../server/imports"),
  S = await import("../server/statements"),
  R = await import("../server/business-routes");
const a = { id: "release-test-admin", role: "ADMIN" };
after(() => E.db.$disconnect());
test("Pakistan phone normalization and dynamically branded templates", () => {
  assert.deepEqual(
    parseCsv(
      'Name,Phone,Remarks\r\n"Ali, Ahmed",03001234567,"First line\nSecond ""quoted"" line"\r\n',
    )[1],
    ["Ali, Ahmed", "03001234567", 'First line\nSecond "quoted" line'],
  );
  assert.throws(() => parseCsv("Name,Name\na,b"), /unique/);
  assert.throws(
    () =>
      normalizeImportRow(
        {
          name: "X",
          openingBalance: "1.001",
          date: "2026-01-01",
          reference: "OPEN",
        },
        "supplier-balances",
      ),
    /two decimal/,
  );
  for (const n of [
    "0300 1234567",
    "+92 300 1234567",
    "00923001234567",
    "3001234567",
  ])
    assert.equal(mobileNumber(n), "923001234567");
  for (const n of ["0300123", "0421112222", "not a phone"])
    assert.equal(mobileNumber(n), null);
  const message = reminderMessage(reminderTemplates.en, {
    store: "Al-Madina",
    customer: "Ahmed",
    balance: "3500.00",
    contact: "0300",
  });
  assert.match(message, /Al-Madina/);
  assert.doesNotMatch(message, /Sehat/);
  assert.equal(
    suggestMapping(["Product", "Type", "Retail", "Unused"], "catalogue")
      .Product,
    "name",
  );
  assert.deepEqual(
    normalizeImportRow({ name: "Ali", mobile: "03001234567" }, "customers"),
    { name: "Ali", mobile: "923001234567" },
  );
  assert.throws(() =>
    normalizeImportRow({ name: "Ali", mobile: "broken" }, "customers"),
  );
});
test("catalogue imports require only name/category, retain unknown metadata, never create stock, and retry safely", async () => {
  const names = [
    "Panadol 500mg",
    "Augmentin 625mg",
    "Brufen Syrup",
    "Disprin",
  ].map((n) => n + " " + randomUUID());
  const job = await I.previewImport(a, {
    kind: "catalogue",
    filename: "minimum.xlsx",
    options: { createCategories: true },
    rows: [
      { name: names[0], category: "Release Pain Relief" },
      { name: names[1], category: "Release Antibiotics", salePrice: 450 },
      {
        name: names[2],
        category: " release   PAIN relief ",
        purchasePrice: 180,
      },
      { name: names[3], category: "Release Pain Relief" },
      { name: "", category: "Bad row" },
    ],
  });
  assert.equal((job.rows as any[]).filter((r) => r.status === "NEW").length, 4);
  const first = await I.commitImport(a, job.id, {});
  assert.equal(first.successful, 4);
  assert.equal(first.skipped, 1);
  const retry = await I.commitImport(a, job.id, {});
  assert.equal(retry.successful, 4);
  const products = await E.db.medicine.findMany({
    where: { name: { in: names } },
    include: { batches: true },
  });
  assert.equal(products.length, 4);
  assert.ok(products.every((m) => m.batches.length === 0));
  assert.ok(products.every((m) => (m.incompleteFields as any[]).length > 0));
  const categories = await E.db.masterData.findMany({
    where: { kind: "CATEGORY", nameKey: "release pain relief" },
  });
  assert.equal(categories.length, 1);
  const duplicate = await I.previewImport(a, {
    kind: "catalogue",
    options: { duplicates: "skip" },
    rows: [{ name: names[0], category: "Release Pain Relief" }],
  });
  assert.equal((duplicate.rows as any[])[0].status, "SKIP");
  await assert.rejects(
    () =>
      I.previewImport(
        { id: "cashier", role: "CASHIER" },
        { kind: "catalogue", rows: [] },
      ),
    /FORBIDDEN/,
  );
});
test("name-phone customer import, name-only suppliers, opening ledgers and no silent overwrite", async () => {
  const name = "Import customer " + randomUUID(),
    supplier = "Import supplier " + randomUUID();
  const job = await I.previewImport(a, {
    kind: "customers",
    rows: [{ name, mobile: "0312" + String(Date.now()).slice(-7) }],
  });
  assert.equal((await I.commitImport(a, job.id, {})).successful, 1);
  const c = await E.db.customer.findFirstOrThrow({ where: { name } });
  assert.equal((await F.customerDetail(a, c.id)).outstanding, "0.00");
  const opening = await I.previewImport(a, {
    kind: "customer-balances",
    rows: [
      {
        name,
        openingBalance: 150,
        date: "2026-01-01",
        reference: "OPEN-" + randomUUID(),
      },
    ],
  });
  assert.equal((await I.commitImport(a, opening.id, {})).successful, 1);
  assert.equal((await F.customerDetail(a, c.id)).outstanding, "150.00");
  const repeat = await I.previewImport(a, {
    kind: "customer-balances",
    rows: [
      { name, openingBalance: 999, date: "2026-01-01", reference: "OTHER" },
    ],
  });
  assert.equal((repeat.rows as any[])[0].status, "INVALID");
  const suppliers = await I.previewImport(a, {
    kind: "suppliers",
    rows: [{ name: supplier }],
  });
  assert.equal((await I.commitImport(a, suppliers.id, {})).successful, 1);
  const sj = await I.previewImport(a, {
    kind: "supplier-balances",
    rows: [
      {
        name: supplier,
        openingBalance: 200,
        date: "2026-01-01",
        reference: "SUP-OPEN",
      },
    ],
  });
  assert.equal((await I.commitImport(a, sj.id, {})).successful, 1);
  assert.equal(
    (
      await E.db.supplier.findUniqueOrThrow({ where: { name: supplier } })
    ).openingPayable.toFixed(2),
    "200.00",
  );
});
test("statement historical items, date opening, payments, returns and reversal reconcile", async () => {
  const c = await F.saveCustomer(a, {
    name: "Statement " + randomUUID(),
    mobile: "03001234567",
    creditEnabled: true,
  });
  const opening = await I.previewImport(a, {
    kind: "customer-balances",
    rows: [
      {
        name: c.name,
        openingBalance: 100,
        date: "2026-01-01",
        reference: "STMT-OPEN-" + randomUUID(),
      },
    ],
  });
  await I.commitImport(a, opening.id, {});
  const m = await E.saveMedicine(a, {
    name: "Statement item " + randomUUID(),
    purchasePrice: "2",
    salePrice: "10",
  });
  await E.opening(a, {
    key: randomUUID(),
    medicineId: m.id,
    batchNumber: "TEST",
    expiry: "2035-12-31",
    quantity: 10,
    unit: "base",
    unitCost: "2",
    reference: randomUUID(),
  });
  const sale = await E.completeSale(a, {
    key: randomUUID(),
    customerId: c.id,
    lines: [{ medicineId: m.id, unit: "base", quantity: 2 }],
    payments: [{ method: "CREDIT", amount: "20" }],
  });
  const payment = await F.collectPayment(a, {
    key: randomUUID(),
    customerId: c.id,
    amount: "30",
    method: "CASH",
    paymentDate: E.today(),
  });
  const al = await E.db.allocation.findFirstOrThrow({
    where: { saleLine: { saleId: sale.id } },
  });
  await E.returnStock(a, {
    key: randomUUID(),
    type: "SALE",
    originalId: al.id,
    quantity: 1,
    reason: "Customer return",
    reference: "Return invoice",
  });
  await F.reverseCollection(a, payment.id, {
    key: randomUUID(),
    reason: "Payment entered twice",
  });
  await E.saveMedicine(
    a,
    { ...JSON.parse(JSON.stringify(m)), salePrice: "99" },
    m.id,
  );
  const d = await S.statement(c.id);
  assert.equal(d.closing, (await F.customerDetail(a, c.id)).netBalance);
  assert.equal(d.closing, "110.00");
  const credit = d.rows.find((r) => r.type === "CREDIT_SALE");
  assert.equal(String(credit.invoice.lines[0].price), "10");
  assert.match(credit.document, /MS-/);
  assert.equal(credit.invoice.cogs, undefined);
  assert.equal(
    d.rows.find((r) => r.type === "SALE_RETURN").returnDetails.item,
    m.name,
  );

  const ranged = await S.statement(c.id, "2026-02-01", E.today());
  assert.equal(ranged.opening, "100.00");
  assert.equal(ranged.closing, "110.00");
});
test("reorder excludes expired and quarantined stock and converts packaging", async () => {
  const m = await E.saveMedicine(a, {
    name: "Reorder " + randomUUID(),
    minimumStock: 20,
    reorderLevel: 25,
    reorderQuantity: 30,
    unitsPerStrip: 10,
    stripsPerBox: 10,
  });
  await E.opening(a, {
    key: randomUUID(),
    medicineId: m.id,
    batchNumber: "LIVE",
    expiry: "2035-12-31",
    quantity: 5,
    unit: "base",
    unitCost: "2",
    reference: randomUUID(),
  });
  await E.opening(a, {
    key: randomUUID(),
    medicineId: m.id,
    batchNumber: "QUAR",
    expiry: "2035-12-31",
    status: "QUARANTINED",
    quantity: 100,
    unit: "base",
    unitCost: "2",
    reference: randomUUID(),
  });
  const old = await E.opening(a, {
    key: randomUUID(),
    medicineId: m.id,
    batchNumber: "OLD",
    expiry: "2020-01-01",
    status: "QUARANTINED",
    quantity: 100,
    unit: "base",
    unitCost: "2",
    reference: randomUUID(),
  });
  await E.db.batch.update({
    where: { id: old.id },
    data: { status: "SELLABLE" },
  });
  const r = (await R.reorderReport()).find((r) => r.id === m.id)!;
  assert.equal(r.available, 5);
  assert.equal(r.required, 25);
  assert.equal(r.units.find((u) => u.id === "strip")?.factor, 10);
});
test("opening import stages incomplete rows and posts complete stock once", async () => {
  const m = await E.saveMedicine(a, {
    name: "Stock import " + randomUUID(),
    salePrice: "10",
  });
  const incomplete = await I.previewImport(a, {
    kind: "stock",
    rows: [
      {
        medicineId: m.id,
        quantity: 5,
        unit: "base",
        unitCost: 2,
        date: E.today(),
        reference: randomUUID(),
      },
    ],
  });
  assert.equal((incomplete.rows as any[])[0].status, "INVALID");
  const job = await I.previewImport(a, {
    kind: "stock",
    rows: [
      {
        medicineId: m.id,
        batchNumber: "IMPORTED",
        expiry: "2035-12-31",
        quantity: 5,
        unit: "base",
        unitCost: 2,
        date: E.today(),
        reference: "IMPORT-" + randomUUID(),
      },
    ],
  });
  assert.equal((await I.commitImport(a, job.id, {})).successful, 1);
  await I.commitImport(a, job.id, {});
  assert.equal(await E.db.batch.count({ where: { medicineId: m.id } }), 1);
  const repeated = await I.previewImport(a, {
    kind: "stock",
    rows: [
      {
        medicineId: m.id,
        batchNumber: "IMPORTED",
        expiry: "2035-12-31",
        quantity: 5,
        unit: "base",
        unitCost: 2,
        date: E.today(),
        reference: "DIFFERENT-" + randomUUID(),
      },
    ],
  });
  const duplicateResult = await I.commitImport(a, repeated.id, {});
  assert.equal(duplicateResult.failed, 1);
  assert.equal(await E.db.batch.count({ where: { medicineId: m.id } }), 1);
});
test("historical grouped purchases reconcile, records-only has no stock impact, explicit stock purchases post once", async () => {
  const supplier = await E.db.supplier.create({
      data: { name: "History supplier " + randomUUID() },
    }),
    m = await E.saveMedicine(a, {
      name: "History product " + randomUUID(),
      salePrice: "10",
    });
  const base = {
    supplier: supplier.name,
    reference: "INV-" + randomUUID(),
    date: E.today(),
    medicineId: m.id,
    quantity: 2,
    unit: "base",
    unitCost: 2,
    total: 8,
  };
  const records = await I.previewImport(a, {
    kind: "purchases",
    rows: [base, { ...base, quantity: 2 }],
  });
  assert.equal((records.rows as any[])[0].status, "NEW");
  assert.equal((await I.commitImport(a, records.id, {})).successful, 2);
  assert.equal(await E.db.batch.count({ where: { medicineId: m.id } }), 0);
  const stock = await I.previewImport(a, {
    kind: "purchases",
    options: { stockImpact: true },
    rows: [
      {
        ...base,
        reference: "STOCK-" + randomUUID(),
        total: 4,
        batchNumber: "PUR",
        expiry: "2035-12-31",
        salePrice: 10,
      },
    ],
  });
  await assert.rejects(() => I.commitImport(a, stock.id, {}), /confirmation/);
  assert.equal(
    (await I.commitImport(a, stock.id, { confirmStockImpact: true }))
      .successful,
    1,
  );
  await I.commitImport(a, stock.id, { confirmStockImpact: true });
  assert.equal(
    (
      await E.db.batch.findMany({ where: { medicineId: m.id } })
    )[0].quantity.toString(),
    "2",
  );
});
test("WhatsApp balance comes from the reconciled ledger net of advances", async () => {
  const old = await E.db.settings.findUnique({ where: { id: "store" } });
  await E.db.settings.upsert({
    where: { id: "store" },
    create: { id: "store", data: { storeName: "Reminder Brand" } },
    update: {
      data: { ...((old?.data as any) || {}), storeName: "Reminder Brand" },
    },
  });
  try {
    const c = await F.saveCustomer(a, {
      name: "Advance reminder " + randomUUID(),
      mobile: "03001234567",
      creditEnabled: true,
      openingBalance: "100",
    });
    const m = await E.saveMedicine(a, {
      name: "Advance product " + randomUUID(),
      salePrice: "10",
    });
    await E.opening(a, {
      key: randomUUID(),
      medicineId: m.id,
      batchNumber: "REM",
      expiry: "2035-12-31",
      quantity: 20,
      unit: "base",
      unitCost: "2",
      reference: randomUUID(),
    });
    await F.collectPayment(a, {
      key: randomUUID(),
      customerId: c.id,
      amount: "150",
      method: "CASH",
      paymentDate: E.today(),
      allowAdvance: true,
    });
    const sell = (quantity: number) =>
      E.completeSale(a, {
        key: randomUUID(),
        customerId: c.id,
        lines: [{ medicineId: m.id, unit: "base", quantity }],
        payments: [{ method: "CREDIT", amount: String(quantity * 10) }],
      });
    await sell(2);
    const routes = new Map<string, any>();
    R.registerBusinessRoutes(
      (method: string, path: string, fn: any) => routes.set(method + path, fn),
      () => a,
    );
    const remind = routes.get("get/customers/:id/reminder");
    await assert.rejects(
      () => remind({ params: { id: c.id }, query: {} }),
      /positive outstanding/,
    );
    await sell(4);
    const preview = await remind({ params: { id: c.id }, query: {} });
    assert.equal(preview.balance, "10.00");
    assert.match(preview.message, /Reminder Brand/);
  } finally {
    if (old)
      await E.db.settings.update({
        where: { id: "store" },
        data: { data: old.data as any },
      });
    else await E.db.settings.delete({ where: { id: "store" } });
  }
});
test("imported historical records remain append-only", async () => {
  const h = await E.db.historicalInvoice.create({
    data: {
      kind: "sales",
      partyId: "test-party",
      reference: randomUUID(),
      date: E.today(),
      total: "10",
      data: [],
      createdBy: a.id,
    },
  });
  await assert.rejects(
    () =>
      E.db.historicalInvoice.update({
        where: { id: h.id },
        data: { total: "11" },
      }),
    /append-only/,
  );
  assert.equal(
    (
      await E.db.historicalInvoice.findUniqueOrThrow({ where: { id: h.id } })
    ).total.toString(),
    "10",
  );
});
test("unknown catalogue cost cannot silently post zero-cost stock; confirmed zero costs remain supported", async () => {
  const name = "Unknown cost " + randomUUID();
  const job = await I.previewImport(a, {
    kind: "catalogue",
    options: { createCategories: true },
    rows: [{ name, category: "Cost safety" }],
  });
  assert.equal((await I.commitImport(a, job.id, {})).successful, 1);
  const m = await E.db.medicine.findFirstOrThrow({ where: { name } });
  const supplier = await E.db.supplier.create({
    data: { name: "Cost supplier " + randomUUID() },
  });
  await assert.rejects(
    () =>
      E.savePurchase(a, {
        supplierId: supplier.id,
        supplierInvoice: randomUUID(),
        invoiceDate: E.today(),
        receivingDate: E.today(),
        lines: [
          {
            medicineId: m.id,
            batchNumber: "COST",
            expiry: "2035-12-31",
            quantity: 1,
            unit: "base",
            unitCost: "0",
            sellingPrice: "0",
          },
        ],
      }),
    /Actual purchase cost is missing/,
  );
  await assert.rejects(
    () =>
      E.opening(a, {
        key: randomUUID(),
        medicineId: m.id,
        batchNumber: "COST",
        expiry: "2035-12-31",
        quantity: 1,
        unit: "base",
        unitCost: "0",
        reference: randomUUID(),
      }),
    /Actual opening-stock cost is missing/,
  );
  assert.equal(await E.db.batch.count({ where: { medicineId: m.id } }), 0);
  const known = await E.saveMedicine(a, {
    name: "Known zero " + randomUUID(),
    category: "Cost safety",
    purchasePrice: "0",
    salePrice: "0",
  });
  const update = await I.previewImport(a, {
    kind: "catalogue",
    options: { duplicates: "update" },
    rows: [{ name: known.name, category: "Cost safety" }],
  });
  assert.equal((await I.commitImport(a, update.id, {})).successful, 1);
  const preserved = await E.db.medicine.findUniqueOrThrow({
    where: { id: known.id },
  });
  assert.deepEqual(preserved.incompleteFields, []);
  await E.opening(a, {
    key: randomUUID(),
    medicineId: known.id,
    batchNumber: "FREE",
    expiry: "2035-12-31",
    quantity: 1,
    unit: "base",
    unitCost: "0",
    reference: randomUUID(),
  });
});
