import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("Dedicated _test database required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const E = await import("../server/engine");
const F = await import("../server/finance");
const C = await import("../server/catalogue");
const Draft = await import("../server/carts");
const { creditReport } = await import("../server/credit-reports");
const { report } = await import("../server/reports");
const { invoiceDocument } = await import("../server/printing");
const { db } = E;
const a = { id: "enhancement-admin", role: "ADMIN" },
  cashier = { id: "enhancement-cashier", role: "CASHIER" };
const uid = () => randomUUID();
async function master(kind: string, name: string) {
  return db.masterData.findFirstOrThrow({
    where: { kind, nameKey: name.toLowerCase() },
  });
}
async function product(extra: any = {}) {
  return E.saveMedicine(a, {
    name: "Acceptance " + uid(),
    salePrice: 10,
    purchasePrice: 2,
    unitsPerStrip: 1,
    stripsPerBox: 1,
    ...extra,
  });
}
async function stock(m: any, quantity = 100, extra: any = {}) {
  return E.opening(a, {
    key: uid(),
    medicineId: m.id,
    batchNumber: uid(),
    expiry: "2035-12-31",
    quantity,
    unit: "base",
    unitCost: 2,
    reference: uid(),
    ...extra,
  });
}
const sale = (m: any, extra: any = {}) => ({
  key: uid(),
  lines: [{ medicineId: m.id, unit: "base", quantity: 1, discount: 0 }],
  discount: 0,
  payment: "CASH",
  tendered: 1000,
  ...extra,
});
const customer = (extra: any = {}) =>
  F.saveCustomer(a, {
    key: uid(),
    name: "Customer " + uid(),
    creditEnabled: true,
    creditLimit: "1000",
    ...extra,
  });
const collection = (c: any, amount: string, extra: any = {}) => ({
  key: uid(),
  customerId: c.id,
  amount,
  method: "CASH",
  paymentDate: E.today(),
  ...extra,
});
after(() => db.$disconnect());
test("master data: case-insensitive duplicates, safe deletion and inactive references", async () => {
  const name = "Category " + uid();
  const category = await C.saveMaster(a, { kind: "CATEGORY", name });
  await assert.rejects(() =>
    C.saveMaster(a, { kind: "CATEGORY", name: name.toUpperCase() }),
  );
  const m = await product({ categoryId: category.id });
  assert.equal(m.category, name);
  await assert.rejects(() => C.deleteMaster(a, category.id), /linked/);
  await C.saveMaster(
    a,
    { kind: "CATEGORY", name: name + " renamed", active: false },
    category.id,
  );
  await assert.rejects(() => product({ categoryId: category.id }), /inactive/);
  const free = await C.saveMaster(a, {
    kind: "DOSAGE_FORM",
    name: "Free " + uid(),
  });
  await C.deleteMaster(a, free.id);
  await assert.rejects(
    () => C.saveMaster(cashier, { kind: "CATEGORY", name: "Denied" }),
    /FORBIDDEN/,
  );
});
test("universal products without barcode: sachet, injection, syringe and IV fluid with custom conversions", async () => {
  for (const [type, form, unit] of [
    ["Medicine", "Sachet", "Sachet"],
    ["Injection / Injectable Medicine", "Ampoule", "Ampoule"],
    ["Medical Consumable", "", "Piece"],
    ["IV Fluid / Infusion", "Infusion", "Bottle"],
  ]) {
    const t = await master("PRODUCT_TYPE", type);
    const u = await master("UOM", unit);
    const carton = await master("UOM", "Carton");
    const m = await product({
      productTypeId: t.id,
      form,
      baseUnitId: u.id,
      packaging: [{ unitId: carton.id, factor: 20 }],
      purchaseUnit: carton.id,
    });
    assert.equal(m.barcode, null);
    await stock(m, 2, { unit: carton.id });
    const s = await E.completeSale(a, sale(m));
    assert.equal(Number(s.total), 10);
    assert.equal(
      Number(
        (await db.batch.findFirstOrThrow({ where: { medicineId: m.id } }))
          .quantity,
      ),
      39,
    );
  }
});
test("barcode check digits and mandatory medicine safeguards cannot be bypassed", async () => {
  await assert.rejects(
    () => product({ barcode: "1234567890123", barcodeType: "EAN13" }),
    /check digit/,
  );
  const m = await product({
    batchTracked: false,
    expiryTracked: false,
    barcode: (() => {
      const prefix =
        String(randomInt(100000, 999999)) + String(randomInt(100000, 999999));
      const sum = [...prefix]
        .reverse()
        .reduce((n, v, i) => n + Number(v) * (i % 2 === 0 ? 3 : 1), 0);
      return prefix + ((10 - (sum % 10)) % 10);
    })(),
    barcodeType: "EAN13",
  });
  assert.equal(m.batchTracked, true);
  assert.equal(m.expiryTracked, true);
  await assert.rejects(() => stock(m, 1, { expiry: "" }), /expiry/);
  await assert.rejects(() => stock(m, 1, { batchNumber: "" }), /batch/);
});
test("fractional quantities only where configured, stock and returns reconcile exactly", async () => {
  const t = await master("PRODUCT_TYPE", "Medical Consumable"),
    u = await master("UOM", "Gram");
  const m = await product({
    productTypeId: t.id,
    form: "",
    baseUnitId: u.id,
    fractionalAllowed: true,
  });
  await stock(m, 2.5, { batchNumber: "", expiry: "" });
  const s = await E.completeSale(
    a,
    sale(m, {
      lines: [{ medicineId: m.id, unit: "base", quantity: 0.75, discount: 0 }],
    }),
  );
  assert.equal(Number(s.total), 7.5);
  const al = await db.allocation.findFirstOrThrow({
    where: { saleLine: { saleId: s.id } },
  });
  await E.returnStock(a, {
    key: uid(),
    type: "SALE",
    originalId: al.id,
    quantity: 0.25,
    reference: uid(),
    reason: "Partial return",
    disposition: "SELLABLE",
  });
  assert.equal(
    Number(
      (await db.batch.findFirstOrThrow({ where: { medicineId: m.id } }))
        .quantity,
    ),
    2,
  );
  const solid = await product();
  await assert.rejects(() => stock(solid, 0.5), /fractional/);
});
test("MRP is nonblocking and audited at product and checkout", async () => {
  const m = await product({ mrp: 8, salePrice: 10 });
  await stock(m);
  await E.completeSale(a, sale(m));
  const warnings = await db.audit.findMany({
    where: { entity: m.id, action: "MRP_WARNING" },
  });
  assert.ok(warnings.length >= 2);
});
test("split payment, cash change, bank reference, card privacy and operator verification", async () => {
  const m = await product();
  await stock(m);
  const bank = await F.saveBank(a, {
    name: "Test bank " + uid(),
    bankName: "Test",
    accountTitle: "Store",
    accountNumber: "LOCAL-TEST",
  });
  const s = await E.completeSale(
    a,
    sale(m, {
      payments: [
        { method: "CASH", amount: "3", tendered: "5" },
        {
          method: "CARD",
          amount: "3",
          cardLastFour: "1234",
          reference: "terminal receipt",
        },
        {
          method: "TRANSFER",
          amount: "4",
          bankAccountId: bank.id,
          reference: "transfer receipt",
        },
      ],
    }),
  );
  assert.equal(s.change, "2.00");
  const payments = await db.payment.findMany({ where: { saleId: s.id } });
  assert.ok(payments.every((p) => p.verification === "OPERATOR_RECORDED"));
  await assert.rejects(
    () =>
      E.completeSale(
        a,
        sale(m, {
          payments: [
            { method: "TRANSFER", amount: "10", bankAccountId: bank.id },
          ],
        }),
      ),
    /reference/,
  );
  await assert.rejects(() =>
    E.completeSale(
      a,
      sale(m, {
        payments: [
          { method: "CARD", amount: "10", cardLastFour: "4111111111111111" },
        ],
      }),
    ),
  );
  await assert.rejects(
    () =>
      E.completeSale(
        a,
        sale(m, { payments: [{ method: "CASH", amount: "9" }] }),
      ),
    /equal/,
  );
});
test("credit limit, partial collection, idempotency, manual settlement, return and reversal reconcile", async () => {
  const c = await customer({ creditLimit: "25" }),
    m = await product();
  await stock(m);
  const s1 = await E.completeSale(
    cashier,
    sale(m, {
      customerId: c.id,
      payments: [{ method: "CREDIT", amount: "10" }],
    }),
  );
  const s2 = await E.completeSale(
    cashier,
    sale(m, {
      customerId: c.id,
      payments: [{ method: "CREDIT", amount: "10" }],
    }),
  );
  await assert.rejects(
    () =>
      E.completeSale(
        cashier,
        sale(m, {
          customerId: c.id,
          payments: [{ method: "CREDIT", amount: "10" }],
        }),
      ),
    /limit/,
  );
  const p = collection(c, "5");
  const first = await F.collectPayment(cashier, p);
  const repeat = await F.collectPayment(cashier, p);
  assert.equal(first.id, repeat.id);
  assert.equal((await F.customerDetail(a, c.id)).outstanding, "15.00");
  await F.collectPayment(
    cashier,
    collection(c, "12", {
      allocations: [
        { saleId: s1.id, amount: "5" },
        { saleId: s2.id, amount: "7" },
      ],
    }),
  );
  let detail = await F.customerDetail(a, c.id);
  assert.equal(detail.outstanding, "3.00");
  assert.equal(
    detail.accounts.find((x) => x.saleId === s1.id)?.status,
    "Fully Paid",
  );
  const al = await db.allocation.findFirstOrThrow({
    where: { saleLine: { saleId: s2.id } },
  });
  const r = await E.returnStock(a, {
    key: uid(),
    type: "SALE",
    originalId: al.id,
    quantity: 1,
    reference: uid(),
    reason: "Return",
    disposition: "SELLABLE",
  });
  assert.equal(Number(r.receivableReduction), 3);
  assert.equal(Number(r.refundAmount), 7);
  detail = await F.customerDetail(a, c.id);
  assert.equal(detail.outstanding, "0.00");
  await F.reverseCollection(a, first.id, { key: uid(), reason: "Correction" });
  detail = await F.customerDetail(a, c.id);
  assert.equal(detail.outstanding, "5.00");
  assert.equal(detail.ledger.at(-1)?.balance, "5.00");
  await assert.rejects(
    () => F.reverseCollection(a, first.id, { key: uid(), reason: "Duplicate" }),
    /already/,
  );
});
test("opening balance, explicit advance, advance checkout and credit-note ledger", async () => {
  const c = await customer({ openingBalance: "20" });
  await assert.rejects(
    () => F.collectPayment(a, collection(c, "30")),
    /advance/,
  );
  await F.collectPayment(a, collection(c, "30", { allowAdvance: true }));
  let d = await F.customerDetail(a, c.id);
  assert.equal(d.outstanding, "0.00");
  assert.equal(d.advance, "10.00");
  assert.equal(d.ledger.at(-1)?.balance, "-10.00");
  const m = await product();
  await stock(m);
  await E.completeSale(
    a,
    sale(m, {
      customerId: c.id,
      payments: [{ method: "ADVANCE", amount: "10" }],
    }),
  );
  d = await F.customerDetail(a, c.id);
  assert.equal(d.advance, "0.00");
  assert.equal(d.ledger.at(-1)?.balance, "0.00");
  await E.completeSale(
    a,
    sale(m, {
      customerId: c.id,
      payments: [{ method: "CREDIT", amount: "10" }],
    }),
  );
  await F.creditNote(a, {
    key: uid(),
    customerId: c.id,
    amount: "4",
    reference: uid(),
    reason: "Authorized correction",
  });
  assert.equal((await F.customerDetail(a, c.id)).outstanding, "6.00");
});
test("cashier cannot approve credit and financial records remain append-only", async () => {
  await assert.rejects(
    () => F.saveCustomer(cashier, { name: "Denied", creditEnabled: true }),
    /FORBIDDEN/,
  );
  await assert.rejects(
    () =>
      F.creditNote(cashier, {
        key: uid(),
        customerId: "x",
        amount: "1",
        reference: "x",
        reason: "x",
      }),
    /FORBIDDEN/,
  );
  const c = await customer({ openingBalance: "1" });
  const l = await db.customerLedger.findFirstOrThrow({
    where: { customerId: c.id },
  });
  await assert.rejects(() =>
    db.customerLedger.update({
      where: { id: l.id },
      data: { remarks: "Tampered" },
    }),
  );
  await assert.rejects(() => db.customerLedger.delete({ where: { id: l.id } }));
});
test("database drafts preserve carts, use ownership/CAS, revalidate all issues without reserving stock", async () => {
  for (const actor of [a, cashier])
    await db.user.upsert({
      where: { id: actor.id },
      create: {
        id: actor.id,
        email: actor.id + "@test.invalid",
        name: actor.id,
        password: "not-a-login-hash",
        role: actor.role,
      },
      update: {},
    });
  const m = await product(),
    other = await product();
  await stock(m, 2);
  const id = uid();
  const data = {
    lines: [
      {
        medicineId: m.id,
        unit: "base",
        quantity: 3,
        discount: 0,
        expectedPrice: "9",
      },
      { medicineId: other.id, unit: "base", quantity: 1, discount: 0 },
    ],
    notes: "Preserve",
  };
  const d = await Draft.saveDraft(a, { id, version: 0, status: "HELD", data });
  await assert.rejects(() => Draft.resumeDraft(cashier, id), /FORBIDDEN/);
  await assert.rejects(
    () =>
      Draft.saveDraft(a, {
        id,
        version: 0,
        data: { ...data, notes: "conflict" },
      }),
    /another window/,
  );
  const resumed = await Draft.resumeDraft(a, id);
  assert.equal((resumed.data as any).notes, "Preserve");
  assert.ok(resumed.issues.some((x) => x.code === "PRICE"));
  assert.equal(resumed.issues.filter((x) => x.code === "STOCK").length, 2);
  assert.equal(
    Number(
      (await db.batch.findFirstOrThrow({ where: { medicineId: m.id } }))
        .quantity,
    ),
    2,
  );
  await Draft.discardDraft(a, id, resumed.version);
  assert.equal(
    (await db.posDraft.findUniqueOrThrow({ where: { id } })).status,
    "DISCARDED",
  );
});
test("serial-controlled devices keep exact identity through purchase, sale and return", async () => {
  const type = await master("PRODUCT_TYPE", "Medical Device");
  const m = await product({
    productTypeId: type.id,
    form: "",
    serialTracked: true,
  });
  const serial = uid();
  await stock(m, 1, { serialNumbers: [serial], expiry: "", batchNumber: "" });
  await assert.rejects(() => E.completeSale(a, sale(m)), /serial/i);
  const s = await E.completeSale(
    a,
    sale(m, {
      lines: [
        {
          medicineId: m.id,
          unit: "base",
          quantity: 1,
          discount: 0,
          serialNumbers: [serial],
        },
      ],
    }),
  );
  assert.equal(
    (
      await db.stockSerial.findUniqueOrThrow({
        where: { medicineId_serial: { medicineId: m.id, serial } },
      })
    ).status,
    "SOLD",
  );
  const al = await db.allocation.findFirstOrThrow({
    where: { saleLine: { saleId: s.id } },
  });
  await E.returnStock(a, {
    key: uid(),
    type: "SALE",
    originalId: al.id,
    quantity: 1,
    reference: uid(),
    reason: "Device returned",
    disposition: "SELLABLE",
    serialNumbers: [serial],
  });
  assert.equal(
    (
      await db.stockSerial.findUniqueOrThrow({
        where: { medicineId_serial: { medicineId: m.id, serial } },
      })
    ).status,
    "AVAILABLE",
  );
});
test("tax, credit returns, collection reports and inventory valuation keep revenue separate", async () => {
  const old = await db.settings.findUnique({ where: { id: "store" } });
  const settings = {
    ...((old?.data as any) || { storeName: "Test" }),
    taxRate: 10,
  };
  await db.settings.upsert({
    where: { id: "store" },
    create: { id: "store", data: settings },
    update: { data: settings },
  });
  try {
    const c = await customer(),
      m = await product();
    await stock(m, 5);
    const s = await E.completeSale(
      a,
      sale(m, {
        customerId: c.id,
        payments: [{ method: "CREDIT", amount: "11" }],
      }),
    );
    assert.equal(Number(s.tax), 1);
    await F.collectPayment(a, collection(c, "4"));
    let r = await report(E.today(), E.today(), m.id);
    assert.equal(r.summary.sales, "10.00");
    assert.equal(r.summary.profit, "8.00");
    assert.equal(r.summary.inventorySellingValue, "40.00");
    const al = await db.allocation.findFirstOrThrow({
      where: { saleLine: { saleId: s.id } },
    });
    await E.returnStock(a, {
      key: uid(),
      type: "SALE",
      originalId: al.id,
      quantity: 1,
      reference: uid(),
      reason: "Tax return",
      disposition: "SELLABLE",
    });
    r = await report(E.today(), E.today(), m.id);
    assert.equal(r.summary.sales, "0.00");
    assert.equal(r.summary.profit, "0.00");
    const collections = await creditReport(a, {
      kind: "collections",
      customerId: c.id,
      from: E.today(),
      to: E.today(),
    });
    assert.equal(collections.rows.length, 1);
    const accounts = await creditReport(a, {
      kind: "outstanding",
      customerId: c.id,
    });
    assert.equal(accounts.rows[0].outstanding, "0.00");
  } finally {
    if (old)
      await db.settings.update({
        where: { id: "store" },
        data: { data: old.data! },
      });
  }
});
test("all invoice formats produce PDF and reprinting does not create invoices", async () => {
  const m = await product({ name: "Long product name ".repeat(10) + uid() });
  await stock(m);
  const s = await E.completeSale(a, sale(m));
  const record = await db.sale.findUniqueOrThrow({
    where: { id: s.id },
    include: { lines: true, payments: true, creditAccount: true },
  });
  const before = await db.sale.count();
  for (const format of ["58", "80", "A4"]) {
    const pdf = invoiceDocument(
      record,
      { storeName: "Test store", returnPolicy: "Keep the receipt" },
      format,
    );
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((resolve, reject) => {
      pdf.on("data", (b) => chunks.push(b));
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);
    });
    pdf.end();
    const result = await complete;
    assert.equal(result.subarray(0, 4).toString(), "%PDF");
    assert.ok(result.length > 1000);
  }
  assert.equal(await db.sale.count(), before);
});

test("historical outstanding and aging reconstruct debt before later collections", async () => {
  const yesterday = new Date(Date.parse(E.today() + "T12:00:00Z") - 86400000)
    .toISOString()
    .slice(0, 10);
  const past = new Date(yesterday + "T10:00:00+05:00");
  const c = await db.customer.create({
    data: {
      name: "As-of " + uid(),
      openingOutstanding: "80",
      creditEnabled: true,
      createdAt: past,
    },
  });
  await db.customerLedger.create({
    data: {
      customerId: c.id,
      type: "OPENING",
      reference: c.id,
      debit: "100",
      credit: "0",
      createdBy: a.id,
      createdAt: past,
    },
  });
  const payment = await db.collection.create({
    data: {
      customerId: c.id,
      amount: "20",
      openingAllocation: "20",
      advance: "0",
      method: "CASH",
      paymentDate: E.today(),
      createdBy: a.id,
    },
  });
  await db.customerLedger.create({
    data: {
      customerId: c.id,
      type: "PAYMENT",
      reference: payment.id,
      collectionId: payment.id,
      debit: "0",
      credit: "20",
      createdBy: a.id,
    },
  });
  const old = await creditReport(a, {
    kind: "outstanding",
    customerId: c.id,
    from: yesterday,
    to: yesterday,
  });
  assert.equal(old.rows[0].outstanding, "100.00");
  const current = await creditReport(a, {
    kind: "aging",
    customerId: c.id,
    to: E.today(),
  });
  assert.equal(current.rows[0].outstanding, "80.00");
  assert.equal(current.rows[0]["90+ / opening"], "80.00");
});
test("all customer balance projections reconcile with historical ledger including advances, notes and reversals", async () => {
  const historical = await creditReport(a, {
    kind: "outstanding",
    to: E.today(),
  });
  const current = await F.customerList(a);
  for (const row of historical.rows) {
    const c = current.find((x) => x.id === row.customerId);
    if (!c) continue;
    assert.equal(row.outstanding, c.outstanding, "Outstanding " + c.id);
    assert.equal(row.advance, c.advance, "Advance " + c.id);
    assert.equal(row.netBalance, c.netBalance, "Net ledger " + c.id);
  }
});

test("multi-item validation includes every invalid discount without losing product identity", async () => {
  const first = await product(),
    second = await product();
  await stock(first);
  await stock(second);
  await assert.rejects(
    () =>
      E.completeSale(a, {
        key: uid(),
        lines: [
          { medicineId: first.id, unit: "base", quantity: 1, discount: "11" },
          { medicineId: second.id, unit: "base", quantity: 1, discount: "12" },
        ],
        discount: 0,
        payment: "CASH",
        tendered: 100,
      }),
    (e) => {
      assert.ok(e instanceof Draft.CartValidationError);
      assert.equal(e.issues.filter((i) => i.code === "DISCOUNT").length, 2);
      assert.ok(
        e.message.includes(first.name) && e.message.includes(second.name),
      );
      return true;
    },
  );
});
test("simultaneous duplicate collections settle once and competing credit checks remain atomic", async () => {
  const c = await customer({ openingBalance: "10", creditLimit: "15" });
  const p = collection(c, "5");
  const [left, right] = await Promise.all([
    F.collectPayment(a, p),
    F.collectPayment(a, p),
  ]);
  assert.equal(left.id, right.id);
  assert.equal((await F.customerDetail(a, c.id)).outstanding, "5.00");
  const m = await product();
  await stock(m, 2);
  const results = await Promise.allSettled([
    E.completeSale(
      a,
      sale(m, {
        customerId: c.id,
        payments: [{ method: "CREDIT", amount: "10" }],
      }),
    ),
    E.completeSale(
      a,
      sale(m, {
        customerId: c.id,
        payments: [{ method: "CREDIT", amount: "10" }],
      }),
    ),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await F.customerDetail(a, c.id)).outstanding, "15.00");
  assert.equal(
    Number(
      (await db.batch.findFirstOrThrow({ where: { medicineId: m.id } }))
        .quantity,
    ),
    1,
  );
});
