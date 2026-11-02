import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  businessDate,
  expiryStatus,
  expiryThreshold,
  normalizeExpiry,
} from "../shared/expiry";
if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL is required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
  throw new Error("Dedicated test database required");
const E = await import("../server/engine");
const {
  db,
  saveMedicine,
  savePurchase,
  postPurchase,
  opening,
  completeSale,
  importOpening,
} = E;
const a = { id: "expiry-test-admin", role: "ADMIN" };
const shifted = (n: number) =>
  new Date(Date.parse(businessDate() + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
const medicine = () =>
  saveMedicine(a, {
    name: "Expiry " + randomUUID(),
    salePrice: "10",
    purchasePrice: "2",
  });
const row = (medicineId: string, days: number, extra: any = {}) => ({
  medicineId,
  batchNumber: randomUUID(),
  expiry: shifted(days),
  quantity: 10,
  unit: "base",
  unitCost: "2",
  reference: randomUUID(),
  ...extra,
});
async function policy<T>(days: number, fn: () => Promise<T>) {
  const old = await db.settings.findUnique({ where: { id: "store" } });
  const data = (old?.data as any) || {};
  await db.settings.upsert({
    where: { id: "store" },
    create: { id: "store", data: { ...data, expiryDays: days } },
    update: { data: { ...data, expiryDays: days } },
  });
  try {
    return await fn();
  } finally {
    await db.settings.update({ where: { id: "store" }, data: { data } });
  }
}
const countStock=async(id:string)=>Number((await db.batch.aggregate({where:{medicineId:id},_sum:{quantity:true}}))._sum.quantity||0);
after(() => db.$disconnect());
test("Karachi calendar boundaries, inclusive warning threshold, zero and month-only expiry", () => {
  assert.equal(businessDate(new Date("2026-11-01T18:59:59Z")), "2026-11-01");
  assert.equal(businessDate(new Date("2026-11-01T19:00:00Z")), "2026-11-02");
  for (const n of [30, 15, 10, 5, 1, 0, -1]) {
    const e = expiryStatus(shifted(n), 10);
    assert.equal(e.days, n);
    assert.equal(e.requiresAcknowledgement, n > 0 && n <= 10);
    assert.equal(e.blocked, n <= 0);
  }
  assert.equal(expiryThreshold({ expiryDays: 0 }), 0);
  assert.equal(expiryStatus(shifted(1), 0).status, "NORMAL");
  assert.equal(expiryStatus(shifted(0), 0).status, "TODAY");
  assert.equal(normalizeExpiry("2028-02"), "2028-02-29");
  assert.equal(expiryStatus("2028-13", 10).status, "INVALID");
});
test("opening stock enforces each 30/15/10/5/1-day boundary and logs exactly one override on retry", async () =>
  policy(10, async () => {
    for (const days of [30, 15, 10, 5, 1]) {
      const m = await medicine(),
        p = { key: randomUUID(), ...row(m.id, days) };
      if (days <= 10) {
        await assert.rejects(opening(a, p), /Ignore Expiry Warning/);
        assert.equal(await countStock(m.id), 0);
      }
      const input = { ...p, ignoreExpiryWarning: days <= 10 };
      const b = await opening(a, input);
      assert.deepEqual(await opening(a, input), b);
      assert.equal(await countStock(m.id), 10);
      assert.equal(await db.movement.count({ where: { batchId: b.id } }), 1);
      const audits = await db.audit.findMany({
        where: { entity: b.id, action: "EXPIRY_WARNING_OVERRIDE" },
      });
      assert.equal(audits.length, days <= 10 ? 1 : 0);
      if (days <= 10) {
        assert.equal(audits[0].userId, a.id);
        assert.ok(audits[0].createdAt);
        assert.deepEqual(audits[0].details, {
          medicineId: m.id,
          medicineName: m.name,
          batchNumber: p.batchNumber,
          expiry: p.expiry,
          remainingDays: days,
          warningDays: 10,
          businessDate: businessDate(),
          source: "OPENING",
          sourceTransaction: p.reference,
          batchId: b.id,
        });
      }
    }
  }));
test("today/expired opening cannot be bypassed by acknowledgement; quarantine is retained and cannot be released", async () =>
  policy(10, async () => {
    for (const days of [0, -1]) {
      const m = await medicine(),
        p = {
          key: randomUUID(),
          ...row(m.id, days),
          ignoreExpiryWarning: true,
        };
      await assert.rejects(opening(a, p), /sellable stock entry is blocked/);
      assert.equal(await countStock(m.id), 0);
      const b = await opening(a, { ...p, status: "QUARANTINED" });
      assert.equal(b.status, "QUARANTINED");
      assert.equal(
        await db.audit.count({
          where: { entity: b.id, action: "EXPIRY_WARNING_OVERRIDE" },
        }),
        0,
      );
      await assert.rejects(
        E.batchStatus(a, b.id, "SELLABLE", "Inspected", true),
        /blocked/,
      );
      await assert.rejects(
        completeSale(a, {
          key: randomUUID(),
          lines: [{ medicineId: m.id, unit: "base", quantity: 1 }],
          discount: 0,
          payment: "CASH",
          tendered: 10,
        }),
        /Insufficient/,
      );
    }
  }));
async function draft(lines: any[]) {
  const s = await db.supplier.create({
    data: { name: "Expiry supplier " + randomUUID() },
  });
  return savePurchase(a, {
    supplierId: s.id,
    supplierInvoice: randomUUID(),
    invoiceDate: businessDate(),
    receivingDate: businessDate(),
    lines: lines.map((l) => ({
      medicineId: l.medicineId,
      batchNumber: l.batchNumber,
      expiry: l.expiry,
      unit: "base",
      quantity: 10,
      unitCost: 2,
      sellingPrice: 10,
      ignoreExpiryWarning: l.ignoreExpiryWarning || false,
    })),
  });
}
test("multi-line purchase blocks all stock until every near-expiry batch has matching acknowledgement", async () =>
  policy(10, async () => {
    const m = await medicine();
    const p = await draft([row(m.id, 30), row(m.id, 10), row(m.id, 5)]);
    const lines = await db.purchaseLine.findMany({
      where: { purchaseId: p.id },
      orderBy: { expiry: "asc" },
    });
    const key = randomUUID();
    await assert.rejects(postPurchase(a, p.id, key), /Ignore Expiry Warning/);
    assert.equal(await countStock(m.id), 0);
    assert.equal(
      (await db.purchase.findUniqueOrThrow({ where: { id: p.id } })).status,
      "DRAFT",
    );
    assert.equal(
      await db.purchaseLine.count({ where: { purchaseId: p.id } }),
      3,
    );
    const ack = lines
      .filter((l) => l.expiry <= shifted(10))
      .map((l) => ({
        lineId: l.id,
        medicineId: l.medicineId,
        batchNumber: l.batchNumber,
        expiry: l.expiry,
      }));
    await assert.rejects(
      postPurchase(a, p.id, key, ack.slice(0, 1)),
      /Ignore Expiry Warning/,
    );
    await assert.rejects(
      postPurchase(
        a,
        p.id,
        key,
        ack.map((o) => ({ ...o, batchNumber: "stale" })),
      ),
      /Ignore Expiry Warning/,
    );
    const out = await postPurchase(a, p.id, key, ack);
    assert.deepEqual(await postPurchase(a, p.id, key, ack), out);
    assert.equal(await countStock(m.id), 30);
    assert.equal(
      await db.audit.count({
        where: { entity: p.id, action: "EXPIRY_WARNING_OVERRIDE" },
      }),
      2,
    );
    const b = await db.batch.findMany({ where: { medicineId: m.id } });
    assert.equal(
      await db.movement.count({
        where: { batchId: { in: b.map((x) => x.id) } },
      }),
      3,
    );
  }));
test("today and expired purchase lines can be saved as drafts but never posted as normal stock", async () =>
  policy(10, async () => {
    for (const days of [0, -1]) {
      const m = await medicine(),
        p = await draft([row(m.id, days, { ignoreExpiryWarning: true })]);
      await assert.rejects(postPurchase(a, p.id, randomUUID()), /blocked/);
      assert.equal(await countStock(m.id), 0);
      assert.equal(
        (await db.purchase.findUniqueOrThrow({ where: { id: p.id } })).status,
        "DRAFT",
      );
    }
  }));
test("posting reads the latest expiry policy instead of trusting draft-time validation", async () =>
  policy(10, async () => {
    const m = await medicine(),
      p = await draft([row(m.id, 15)]);
    await db.settings.update({
      where: { id: "store" },
      data: { data: { expiryDays: 20 } },
    });
    await assert.rejects(
      postPurchase(a, p.id, randomUUID()),
      /Ignore Expiry Warning/,
    );
    assert.equal(await countStock(m.id), 0);
  }));
test("opening imports roll back every row, enforce per-row acknowledgement and remain idempotent", async () =>
  policy(10, async () => {
    const m = await medicine(),
      rows = [row(m.id, 30), row(m.id, 1)],
      key = randomUUID();
    await assert.rejects(
      importOpening(a, { key, rows }),
      /Ignore Expiry Warning/,
    );
    assert.equal(await countStock(m.id), 0);
    const input = {
      key,
      rows: rows.map((r) => ({ ...r, ignoreExpiryWarning: true })),
    };
    assert.deepEqual(
      await importOpening(a, input),
      await importOpening(a, input),
    );
    assert.equal(await countStock(m.id), 20);
  }));
test("acknowledged near-expiry stock remains sellable with unchanged FEFO and stock deduction", async () =>
  policy(10, async () => {
    const m = await medicine();
    await opening(a, {
      key: randomUUID(),
      ...row(m.id, 5),
      ignoreExpiryWarning: true,
    });
    await opening(a, { key: randomUUID(), ...row(m.id, 15) });
    const sold = await completeSale(a, {
      key: randomUUID(),
      lines: [{ medicineId: m.id, unit: "base", quantity: 2 }],
      discount: 0,
      payment: "CASH",
      tendered: 20,
    });
    const allocations = await db.allocation.findMany({
      where: { saleLine: { saleId: sold.id } },
      include: { batch: true },
    });
    assert.equal(allocations[0].batch.expiry, shifted(5));
    assert.equal(await countStock(m.id), 18);
  }));
