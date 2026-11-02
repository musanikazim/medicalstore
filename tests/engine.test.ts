import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    "Set TEST_DATABASE_URL to a separate database ending in _test",
  );
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
  throw new Error("Tests require a dedicated database ending in _test");
const E = await import("../server/engine");
const {
  db,
  D,
  saveMedicine,
  savePurchase,
  postPurchase,
  completeSale,
  opening,
  adjust,
  returnStock,
  batchStatus,
} = E;
const a = { id: "test-admin", role: "ADMIN" },
  cashier = { id: "test-cashier", role: "CASHIER" };
async function medicine(extra: any = {}) {
  return saveMedicine(a, {
    name: "Test " + randomUUID(),
    salePrice: 10,
    purchasePrice: 2,
    ...extra,
  });
}
async function stock(m: any, quantity = 100, expiry = "2035-12-31", cost = 2) {
  if (expiry <= E.today()) {
    return db.$transaction(async (t) => {
      const b = await t.batch.create({
        data: {
          medicineId: m.id,
          number: randomUUID(),
          expiry,
          quantity,
          received: quantity,
          cost,
          status: "SELLABLE",
        },
      });
      await t.movement.create({
        data: {
          batchId: b.id,
          quantity,
          type: "OPENING",
          reference: "Pre-existing expired fixture",
          createdBy: a.id,
        },
      });
      return b;
    });
  }
  await opening(a, {
    key: randomUUID(),
    medicineId: m.id,
    batchNumber: randomUUID(),
    expiry,
    quantity,
    unit: "base",
    unitCost: cost,
    reference: "integration test",
  });
  return db.batch.findFirstOrThrow({
    where: { medicineId: m.id },
    orderBy: { createdAt: "desc" },
  });
}
function sale(m: any, quantity = 15, extra: any = {}) {
  return {
    key: randomUUID(),
    lines: [{ medicineId: m.id, unit: "base", quantity, discount: 0 }],
    discount: 0,
    payment: "CASH",
    tendered: 100000,
    ...extra,
  };
}
async function balance(m: any) {
  return (
    (
      await db.batch.aggregate({
        where: { medicineId: m.id },
        _sum: { quantity: true },
      })
    )._sum.quantity || 0
  );
}
after(() => db.$disconnect());
test("purchase draft has no stock; posting adds paid + bonus units once and allocates cost", async () => {
  const m = await medicine();
  const supplier = await db.supplier.create({
    data: { name: "Supplier " + randomUUID() },
  });
  const p = await savePurchase(a, {
    supplierId: supplier.id,
    supplierInvoice: randomUUID(),
    invoiceDate: "2026-11-01",
    receivingDate: "2026-11-01",
    charges: 10,
    discount: 5,
    lines: [
      {
        medicineId: m.id,
        unit: "base",
        quantity: 100,
        bonus: 5,
        unitCost: 2,
        discount: 5,
        sellingPrice: 10,
        batchNumber: "PUR",
        expiry: "2030-01-01",
      },
    ],
  });
  assert.equal(await balance(m), 0);
  const key = randomUUID();
  const first = await postPurchase(a, p.id, key);
  assert.deepEqual(await postPurchase(a, p.id, key), first);
  assert.equal(await balance(m), 105);
  const b = await db.batch.findFirstOrThrow({ where: { medicineId: m.id } });
  assert.ok(D(b.cost.toString()).mul(105).minus(200).abs().lt(".0001"));
  await assert.rejects(
    savePurchase(
      a,
      {
        supplierId: supplier.id,
        supplierInvoice: "changed",
        invoiceDate: "2026-11-01",
        receivingDate: "2026-11-01",
        lines: [],
      },
      p.id,
    ),
  );
});
test("purchase 100, sell 15, remaining 85; historical profit uses batch cost", async () => {
  const m = await medicine();
  await stock(m);
  const out = await completeSale(a, sale(m));
  assert.equal(await balance(m), 85);
  await saveMedicine(a, { ...m, purchasePrice: "8", salePrice: "20" }, m.id);
  const s = await db.sale.findUniqueOrThrow({ where: { id: out.id } });
  assert.equal(s.cogs.toString(), "30");
  assert.equal(s.total.toString(), "150");
});
test("FEFO consumes multiple batches and preserves different purchase costs", async () => {
  const m = await medicine();
  const late = await stock(m, 20, "2035-01-01", 5);
  const early = await stock(m, 10, "2030-01-01", 2);
  const s = await completeSale(a, sale(m, 15));
  assert.equal(
    (await db.batch.findUniqueOrThrow({ where: { id: early.id } })).quantity,
    0,
  );
  assert.equal(
    (await db.batch.findUniqueOrThrow({ where: { id: late.id } })).quantity,
    15,
  );
  assert.equal(
    (await db.sale.findUniqueOrThrow({ where: { id: s.id } })).cogs.toString(),
    "45",
  );
});
test("expired, recalled and quarantined stock cannot be sold", async () => {
  for (const status of ["EXPIRED", "QUARANTINED", "RECALLED"]) {
    const m = await medicine();
    const b = await stock(
      m,
      10,
      status === "EXPIRED" ? "2020-01-01" : "2035-01-01",
    );
    if (status !== "EXPIRED")
      await batchStatus(a, b.id, status, "test restriction");
    await assert.rejects(completeSale(a, sale(m, 1)), /Insufficient/);
    assert.equal(await balance(m), 10);
  }
});
test("oversell rejects and rolls back all invoice and stock writes", async () => {
  const m = await medicine();
  await stock(m, 10);
  const before = await db.sale.count();
  await assert.rejects(completeSale(a, sale(m, 11)), /Insufficient/);
  assert.equal(await balance(m), 10);
  assert.equal(await db.sale.count(), before);
});
test("one box, two strips and five tablets consume exactly 125 base units", async () => {
  const m = await medicine();
  await stock(m, 1000);
  await completeSale(
    a,
    sale(m, 1, {
      lines: [
        { medicineId: m.id, unit: "box", quantity: 1 },
        { medicineId: m.id, unit: "strip", quantity: 2 },
        { medicineId: m.id, unit: "base", quantity: 5 },
      ],
    }),
  );
  assert.equal(await balance(m), 875);
});
test("retry same sale deducts once; changed payload rejects reused key", async () => {
  const m = await medicine();
  await stock(m);
  const p = sale(m);
  const out = await completeSale(a, p);
  assert.deepEqual(await completeSale(a, p), out);
  assert.equal(await balance(m), 85);
  await assert.rejects(completeSale(a, { ...p, tendered: 500 }), /Idempotency/);
});
test("two simultaneous sales for last unit: exactly one succeeds", async () => {
  const m = await medicine();
  await stock(m, 1);
  const results = await Promise.allSettled([
    completeSale(a, sale(m, 1)),
    completeSale(a, sale(m, 1)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await balance(m), 0);
});
test("concurrent duplicate requests return the same sale", async () => {
  const m = await medicine();
  await stock(m);
  const p = sale(m);
  const [x, y] = await Promise.all([completeSale(a, p), completeSale(a, p)]);
  assert.equal(x.id, y.id);
  assert.equal(await balance(m), 85);
});
test("sales return links original allocation, quarantines stock and limits quantity", async () => {
  const m = await medicine();
  await stock(m);
  const s = await completeSale(a, sale(m, 10));
  const line = await db.saleLine.findFirstOrThrow({
    where: { saleId: s.id },
    include: { allocations: true },
  });
  const p = {
    key: randomUUID(),
    type: "SALE",
    originalId: line.allocations[0].id,
    quantity: 3,
    reason: "Returned sealed pack",
    reference: "REF-1",
  };
  const out = await returnStock(a, p);
  assert.equal(out.disposition, "QUARANTINED");
  assert.equal(out.amount, "30");
  assert.equal(await balance(m), 93);
  const quarantined = await db.batch.findUniqueOrThrow({
    where: { id: out.batchId },
  });
  assert.equal(quarantined.status, "QUARANTINED");
  await assert.rejects(
    returnStock(a, { ...p, key: randomUUID(), quantity: 8 }),
    /exceeds/,
  );
  assert.deepEqual(await returnStock(a, p), out);
});
test("purchase return reduces original batch, never below zero", async () => {
  const m = await medicine();
  const supplier = await db.supplier.create({ data: { name: randomUUID() } });
  const p = await savePurchase(a, {
    supplierId: supplier.id,
    supplierInvoice: randomUUID(),
    invoiceDate: "2026-11-01",
    receivingDate: "2026-11-01",
    lines: [
      {
        medicineId: m.id,
        unit: "base",
        quantity: 10,
        unitCost: 2,
        sellingPrice: 10,
        batchNumber: "R",
        expiry: "2030-01-01",
      },
    ],
  });
  await postPurchase(a, p.id, randomUUID());
  const b = await db.batch.findFirstOrThrow({ where: { medicineId: m.id } });
  await returnStock(a, {
    key: randomUUID(),
    type: "PURCHASE",
    originalId: b.id,
    quantity: 4,
    reason: "Incorrect supply",
    reference: "CN-1",
  });
  assert.equal(await balance(m), 6);
});
test("damaged stock adjustment is audited, retry safe and reconciles ledger", async () => {
  const m = await medicine();
  const b = await stock(m);
  const p = {
    key: randomUUID(),
    batchId: b.id,
    quantity: -5,
    reason: "Damaged pack",
    reference: "APPROVED",
  };
  await adjust(a, p);
  await adjust(a, p);
  assert.equal(await balance(m), 95);
  const movements = await db.movement.findMany({ where: { batchId: b.id } });
  assert.equal(
    movements.reduce((s, m) => s + m.quantity, 0),
    95,
  );
  await assert.rejects(
    adjust(a, { ...p, key: randomUUID(), quantity: -100 }),
    /Insufficient/,
  );
});
test("cashier forbidden to change stock, medicines, purchases or discounts", async () => {
  const m = await medicine();
  const b = await stock(m);
  await assert.rejects(saveMedicine(cashier, { name: "No" }), /FORBIDDEN/);
  await assert.rejects(
    adjust(cashier, {
      key: randomUUID(),
      batchId: b.id,
      quantity: 1,
      reason: "No",
      reference: "No",
    }),
    /FORBIDDEN/,
  );
  await assert.rejects(savePurchase(cashier, {}), /FORBIDDEN/);
  await assert.rejects(
    completeSale(cashier, sale(m, 1, { discount: 1 })),
    /manager/,
  );
});
test("prescription reference enforced; base sales disallowed where configured", async () => {
  const m = await medicine({ prescription: true, looseAllowed: false });
  await stock(m);
  await assert.rejects(completeSale(a, sale(m, 1)), /Prescription/);
  await assert.rejects(
    completeSale(a, sale(m, 1, { prescriptionReference: "RX-1" })),
    /Loose/,
  );
  await completeSale(
    a,
    sale(m, 1, {
      lines: [{ medicineId: m.id, unit: "strip", quantity: 1 }],
      prescriptionReference: "RX-1",
    }),
  );
  assert.equal(await balance(m), 90);
});
test("repeated medicine cart lines reserve batch quantities correctly", async () => {
  const m = await medicine();
  await stock(m, 10);
  await assert.rejects(
    completeSale(
      a,
      sale(m, 1, {
        lines: [
          { medicineId: m.id, unit: "base", quantity: 6 },
          { medicineId: m.id, unit: "base", quantity: 6 },
        ],
      }),
    ),
    /Insufficient/,
  );
  assert.equal(await balance(m), 10);
});
test("invalid cash payment rolls back and packaging cannot change after use", async () => {
  const m = await medicine();
  await stock(m);
  const before = await db.sale.count();
  await assert.rejects(completeSale(a, sale(m, 1, { tendered: 0 })), /Cash/);
  assert.equal(await db.sale.count(), before);
  assert.equal(await balance(m), 100);
  await assert.rejects(
    saveMedicine(
      a,
      { ...JSON.parse(JSON.stringify(m)), unitsPerStrip: 20 },
      m.id,
    ),
    /immutable/,
  );
});
test("database failure during stock movement rolls back invoice and balance", async () => {
  const m = await medicine();
  await stock(m);
  const before = await db.sale.count();
  await db.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION test_fail_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='SALE' THEN RAISE EXCEPTION 'simulated storage failure'; END IF; RETURN NEW; END; $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER test_failure BEFORE INSERT ON "Movement" FOR EACH ROW EXECUTE FUNCTION test_fail_payment()`,
  );
  try {
    await assert.rejects(completeSale(a, sale(m, 1)));
    assert.equal(await balance(m), 100);
    assert.equal(await db.sale.count(), before);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER test_failure ON "Movement"');
    await db.$executeRawUnsafe("DROP FUNCTION test_fail_payment()");
  }
});
test("all batch balances reconcile; history cannot be edited", async () => {
  const batches = await db.batch.findMany({ include: { movements: true } });
  assert.ok(batches.length > 0);
  for (const b of batches)
    assert.equal(
      b.quantity,
      b.movements.reduce((s, m) => s + m.quantity, 0),
    );
  const m = await db.movement.findFirstOrThrow();
  await assert.rejects(
    db.movement.update({ where: { id: m.id }, data: { quantity: 999 } }),
  );
});
test("fractional base-unit prices round invoice lines and cumulative refunds exactly", async () => {
  const m = await medicine({ salePrice: "0.333333" });
  await stock(m, 10);
  const out = await completeSale(a, sale(m, 3));
  assert.equal(out.total, "1");
  const line = await db.saleLine.findFirstOrThrow({
    where: { saleId: out.id },
    include: { allocations: true },
  });
  assert.equal(line.net.toString(), "1");
  let total = D(0);
  for (let i = 0; i < 3; i++) {
    const r = await returnStock(a, {
      key: randomUUID(),
      type: "SALE",
      originalId: line.allocations[0].id,
      quantity: 1,
      reason: "Return",
      reference: "ROUND-" + i,
    });
    total = total.plus(r.amount);
  }
  assert.equal(total.toString(), "1");
});

test("opening imports are atomic and reject duplicate migration rows", async () => {
  const m = await medicine();
  const row = {
    medicineId: m.id,
    batchNumber: "OPENING-IMPORT",
    expiry: "2030-12",
    quantity: 100,
    unit: "base",
    unitCost: 2,
    reference: "IMPORT-" + randomUUID(),
    openingDate: "2026-01-01",
  };
  await assert.rejects(
    E.importOpening(a, {
      key: randomUUID(),
      rows: [row, { ...row, medicineId: randomUUID() }],
    }),
  );
  assert.equal(await balance(m), 0);
  await E.importOpening(a, { key: randomUUID(), rows: [row] });
  assert.equal(await balance(m), 100);
  const b = await db.batch.findFirstOrThrow({
    where: { medicineId: m.id },
    include: { movements: true },
  });
  assert.equal(b.expiry, "2030-12-31");
  assert.equal(b.movements[0].effectiveDate, "2026-01-01");
  const { report } = await import("../server/reports");
  const historical = await report("2026-01-01", "2026-01-01", m.id);
  assert.equal(historical.movements[0].batchId, b.id);
  await assert.rejects(
    E.importOpening(a, { key: randomUUID(), rows: [row] }),
    /Duplicate/,
  );
  assert.equal(await balance(m), 100);
});

test("medicine reports reconcile net revenue, original COGS and returns", async () => {
  const m = await medicine(),
    other = await medicine();
  await stock(m, 20, "2035-01-01", 2);
  await stock(other, 20, "2035-01-01", 4);
  const out = await completeSale(
    a,
    sale(m, 1, {
      lines: [
        { medicineId: m.id, unit: "base", quantity: 5 },
        { medicineId: other.id, unit: "base", quantity: 3 },
      ],
    }),
  );
  const line = await db.saleLine.findFirstOrThrow({
    where: { saleId: out.id, medicineId: m.id },
    include: { allocations: true },
  });
  await returnStock(a, {
    key: randomUUID(),
    type: "SALE",
    originalId: line.allocations[0].id,
    quantity: 2,
    reason: "Test return",
    reference: "REPORT",
  });
  const { report } = await import("../server/reports");
  const r = await report(E.today(), E.today(), m.id);
  assert.equal(r.summary.sales, "30.00");
  assert.equal(r.summary.profit, "24.00");
  assert.equal(r.medicineSales[0].profit, "24.00");
  assert.equal(r.inventorySummary[0].stock, 17);
  assert.equal(r.inventorySummary[0].available, 15);
  const inv = r.inventorySummary[0];
  assert.equal(
    inv.opening +
      inv.purchased +
      inv.salesReturns +
      inv.adjustments -
      inv.sold -
      inv.purchaseReturns,
    inv.stock,
  );
});

test("store discount limits and loose-unit policy are enforced on the server", async () => {
  const old = await db.settings.findUnique({ where: { id: "store" } });
  const original = (old?.data as Record<string, any>) || {};
  const m = await medicine();
  await stock(m);
  try {
    await db.settings.upsert({
      where: { id: "store" },
      create: {
        id: "store",
        data: { ...original, cashierDiscountPercent: 10 },
      },
      update: { data: { ...original, cashierDiscountPercent: 10 } },
    });
    await completeSale(cashier, sale(m, 1, { discount: 1 }));
    await assert.rejects(
      completeSale(cashier, sale(m, 1, { discount: 2 })),
      /configured limit/,
    );
    await db.settings.update({
      where: { id: "store" },
      data: { data: { ...original, allowLooseSales: false } },
    });
    await assert.rejects(completeSale(a, sale(m, 1)), /store policy/);
  } finally {
    await db.settings.update({
      where: { id: "store" },
      data: { data: original },
    });
  }
});

test("invoice discount allocation stays nonnegative across cent-priced lines", async () => {
  const m = await medicine({ salePrice: "0.01" });
  await stock(m, 10);
  const out = await completeSale(
    a,
    sale(m, 1, {
      discount: "0.02",
      lines: Array.from({ length: 4 }, () => ({
        medicineId: m.id,
        unit: "base",
        quantity: 1,
      })),
    }),
  );
  assert.equal(out.total, "0.02");
  const lines = await db.saleLine.findMany({ where: { saleId: out.id } });
  assert.ok(
    lines.every(
      (l) => D(l.discount.toString()).gte(0) && D(l.net.toString()).gte(0),
    ),
  );
  assert.equal(
    lines.reduce((s, l) => s.plus(l.net.toString()), D(0)).toString(),
    "0.02",
  );
});
