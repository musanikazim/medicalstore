import {
  db,
  D,
  today,
  transaction,
  requireRole,
  managers,
  audit,
} from "./core";
import { balance } from "./finance";
import {
  businessReference,
  mobileNumber,
  reminderTemplates,
  reminderMessage,
} from "../shared/business";
import { businessDocument, amountText } from "./business-printing";
import { registerImportRoutes } from "./imports";
import { seedDemo } from "./demo";
export async function reorderReport(filters: any = {}) {
  const products = await db.medicine.findMany({
    where: { active: true },
    include: {
      packaging: { include: { unit: true } },
      batches: true,
      purchaseLines: { include: { purchase: { include: { supplier: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return products
    .filter(
      (m) =>
        (!filters.category || m.category === filters.category) &&
        (!filters.supplierId ||
          m.purchaseLines.some(
            (l) => l.purchase.supplierId === filters.supplierId,
          )),
    )
    .map((m) => {
      const available = m.batches
        .filter(
          (b) =>
            b.status === "SELLABLE" &&
            (!m.expiryTracked || b.expiry >= today()),
        )
        .reduce((n, b) => n.plus(b.quantity.toString()), D(0));
      const target = Math.max(
        m.reorderQuantity,
        m.minimumStock,
        m.reorderLevel,
      );
      const units = [
        { id: "base", name: m.baseUnit, factor: 1 },
        ...(!m.packaging.length
          ? [
              { id: "strip", name: "strip", factor: m.unitsPerStrip },
              {
                id: "box",
                name: "box",
                factor: m.unitsPerStrip * m.stripsPerBox,
              },
            ]
          : m.packaging.map((u) => ({
              id: u.unitId,
              name: u.unit.name,
              factor: Number(u.factor),
            }))),
      ];
      return {
        id: m.id,
        name: m.name,
        category: m.category,
        available: available.toNumber(),
        minimum: m.minimumStock,
        reorderLevel: m.reorderLevel,
        target,
        required: D(target).minus(available).clamp(0, 1e9).toNumber(),
        baseUnit: m.baseUnit,
        units,
        suppliers: [
          ...new Map(
            m.purchaseLines.map((l) => [
              l.purchase.supplier.id,
              { id: l.purchase.supplier.id, name: l.purchase.supplier.name },
            ]),
          ).values(),
        ],
        status: available.lte(0)
          ? "Out of stock"
          : available.lt(m.minimumStock)
            ? "Low stock"
            : available.lte(m.reorderLevel)
              ? "Reorder"
              : "Adequate",
      };
    })
    .filter(
      (r) =>
        (!filters.status || r.status === filters.status) &&
        (filters.all === "true" || r.status !== "Adequate"),
    );
}
export function registerBusinessRoutes(route: any, actor: any) {
  registerImportRoutes(route, actor);
  const settings = async () =>
    ((await db.settings.findUnique({ where: { id: "store" } }))?.data ||
      {}) as any;
  const send = (res: any, pdf: any) => {
    res.type("pdf");
    pdf.pipe(res);
    pdf.end();
  };
  route("post", "/onboarding/demo", async (r: any) => {
    requireRole(actor(r), ["ADMIN"]);
    if (r.body.confirm !== true)
      throw new Error("Explicit demo-data selection is required");
    const counts = await Promise.all([
      db.medicine.count(),
      db.supplier.count(),
      db.customer.count(),
      db.sale.count(),
      db.purchase.count(),
      db.collection.count(),
      db.batch.count(),
    ]);
    if (counts.some((n) => n > 0))
      throw new Error(
        "Demo loading is available only in an empty store. Existing business records are preserved.",
      );
    await seedDemo(actor(r));
    await transaction(async (t) => {
      const old = ((await t.settings.findUnique({ where: { id: "store" } }))
        ?.data || {}) as any;
      await t.settings.update({
        where: { id: "store" },
        data: { data: { ...old, onboardingComplete: true } },
      });
      await audit(t, actor(r), "EXPLICIT_DEMO_ONBOARDING", "store");
    });
    return { loaded: true };
  });
  route("get", "/customers/:id/reminder", async (r: any) => {
    requireRole(actor(r), managers);
    const s = await settings();
    if (!s.storeName?.trim())
      throw new Error("Configure your store name first");
    const b = await db.$transaction(
      async (t) => {
        const b = await balance(t, String(r.params.id));
        const totals = await t.customerLedger.aggregate({
          where: { customerId: b.customer.id },
          _sum: { debit: true, credit: true },
        });
        const ledgerNet = D(totals._sum.debit?.toString() || 0).minus(
          totals._sum.credit?.toString() || 0,
        );
        if (!ledgerNet.eq(b.net))
          throw new Error(
            "Customer ledger requires reconciliation before sending a reminder",
          );
        return { ...b, reminderBalance: ledgerNet };
      },
      {
        isolationLevel: "RepeatableRead",
      },
    );
    const number = mobileNumber(
      b.customer.mobile,
      s.reminderCountryCode || "92",
    );
    if (!number || !b.reminderBalance.gt(0))
      throw new Error(
        "A valid mobile and positive outstanding balance are required",
      );
    const language = r.query.language === "ur" ? "ur" : "en";
    const template =
      (language === "ur" ? s.reminderRomanUrdu : s.reminderEnglish) ||
      reminderTemplates[language];
    return {
      number,
      balance: b.reminderBalance.toFixed(2),
      message: reminderMessage(template, {
        customer: b.customer.name,
        store: s.storeName,
        balance: b.reminderBalance.toFixed(2),
        contact: s.reminderContact || s.phone || "",
      }),
    };
  });
  route("get", "/suppliers/:id", async (r: any) => {
    requireRole(actor(r), managers);
    return db.supplier.findUniqueOrThrow({
      where: { id: String(r.params.id) },
      include: {
        purchases: {
          include: { lines: { include: { medicine: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  });
  route("get", "/reorder", async (r: any) => {
    requireRole(actor(r), managers);
    return reorderReport(r.query);
  });
  route("post", "/requirements/print", async (r: any, res: any) => {
    requireRole(actor(r), managers);
    if (!Array.isArray(r.body.rows) || r.body.rows.length > 500)
      throw new Error("Select up to 500 products");
    const products = await reorderReport({ all: "true" });
    const suppliers = await db.supplier.findMany();
    const rows = r.body.rows
      .map((row: any) => {
        const m = products.find((m) => m.id === row.id),
          unit = m?.units.find((u) => u.id === row.unit);
        if (
          !m ||
          !unit ||
          !Number.isFinite(Number(row.quantity)) ||
          Number(row.quantity) <= 0 ||
          Number(row.quantity) > 1e8
        )
          throw new Error("Invalid requirement quantity or unit");
        const supplier = suppliers.find((s) => s.id === row.supplierId);
        return {
          supplier: supplier?.name || "Unassigned",
          name: m.name,
          quantity: String(row.quantity),
          unit: unit.name,
          base: D(row.quantity).mul(unit.factor).toString(),
        };
      })
      .sort((a: any, b: any) => a.supplier.localeCompare(b.supplier));
    const d = businessDocument(
      await settings(),
      "PURCHASE REQUIREMENT LIST",
      r.body.paper || "A4",
    );
    d.text(
      "Planning document only. Does not post stock or confirm a purchase. Generated " +
        today(),
    );
    d.table(
      ["Supplier", "Medicine", "Required qty", "Unit", "Base qty"],
      rows.map((x: any) => [x.supplier, x.name, x.quantity, x.unit, x.base]),
      [0.22, 0.32, 0.16, 0.14, 0.16],
      [2, 4],
    );
    send(res, d.finish());
  });
  route("get", "/business-documents/:kind/:id", async (r: any, res: any) => {
    const kind = String(r.params.kind),
      id = String(r.params.id),
      s = await settings();
    const d = businessDocument(
      s,
      kind.replaceAll("-", " ").toUpperCase(),
      String(r.query.paper || s.printFormat || "A4"),
    );
    if (kind === "purchase") {
      requireRole(actor(r), managers);
      const p = await db.purchase.findUniqueOrThrow({
        where: { id },
        include: { supplier: true, lines: { include: { medicine: true } } },
      });
      d.text(
        `Purchase ${p.number} | Supplier invoice ${p.supplierInvoice}\n${p.supplier.name}\n${p.invoiceDate} | ${p.status}`,
      );
      d.table(
        ["Item", "Unit", "Qty", "Cost", "Discount", "Net"],
        p.lines.map((l) => [
          l.medicine.name,
          l.unitLabel || l.unit,
          String(l.quantity),
          amountText(l.unitCost),
          amountText(l.discount),
          amountText(l.net),
        ]),
        [0.32, 0.12, 0.1, 0.16, 0.14, 0.16],
        [2, 3, 4, 5],
      );
      d.text(
        `Charges ${amountText(p.charges)} | Discount ${amountText(p.discount)} | Total PKR ${amountText(p.total)}\n${businessReference(p.remarks)}`,
      );
    } else if (kind === "payment" || kind === "reversal") {
      const c = await db.collection.findUniqueOrThrow({
        where: { id },
        include: { customer: true, reversal: true },
      });
      if (kind === "reversal" && !c.reversal)
        throw new Error("Receipt has not been reversed");
      d.text(
        `RC-${c.number}\nCustomer: ${c.customer.name} | ${c.customer.mobile}\nPayment date: ${c.paymentDate}\nRecorded: ${c.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}`,
      );
      d.table(
        ["Description", "PKR"],
        [
          ["Original payment", amountText(c.amount)],
          ["Reversed amount", c.reversal ? amountText(c.amount) : "0.00"],
          ["Advance portion", amountText(c.advance)],
        ],
        [0.7, 0.3],
        [1],
      );
      d.text(
        `Method: ${c.method}\nReference: ${businessReference(c.reference)}\nRemarks: ${c.remarks}`,
      );
      if (c.reversal)
        d.text(
          `Reversed: ${c.reversal.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}\nReason: ${c.reversal.reason}\nFinancial impact: original collection allocations and advance reversed; receivables reinstated.`,
        );
      else
        d.text(
          "Financial impact: reduces receivables; excess explicitly recorded as advance.",
        );
    } else if (kind === "return" || kind === "refund") {
      requireRole(actor(r), managers);
      const x = await db.returnRecord.findUniqueOrThrow({ where: { id } });
      const allocation = await db.allocation.findUnique({
        where: { id: x.originalId },
        include: { saleLine: { include: { sale: true } } },
      });
      const line = allocation?.saleLine;
      const purchaseLine = await db.purchaseLine.findUnique({
        where: { id: x.originalId },
        include: { purchase: true, medicine: true },
      });
      const customer = x.customerId
        ? await db.customer.findUnique({ where: { id: x.customerId } })
        : null;
      d.text(
        `${x.type} | ${x.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}\nOriginal: ${line ? `${line.sale.invoicePrefix}-${line.sale.number}` : purchaseLine ? purchaseLine.purchase.supplierInvoice : "See original return record"}\nCustomer: ${customer?.name || "Walk-in / supplier"}\n${line?.name || purchaseLine?.medicine.name || ""}`,
      );
      d.table(
        ["Description", "PKR"],
        [
          ["Original amount", amountText(line?.net || purchaseLine?.net || 0)],
          ["Return value", amountText(x.amount)],
          ["Refund", amountText(x.refundAmount)],
          ["Receivable reduction", amountText(x.receivableReduction)],
        ],
        [0.7, 0.3],
        [1],
      );
      d.text(
        `Quantity (base): ${x.quantity}\nMethod: ${x.refundMethod}\nReason: ${x.reason}\nStock disposition: ${x.disposition}`,
      );
    } else if (kind === "adjustment") {
      requireRole(actor(r), managers);
      const m = await db.movement.findUniqueOrThrow({
        where: { id },
        include: { batch: { include: { medicine: true } } },
      });
      if (m.type !== "ADJUSTMENT") throw new Error("Not a stock adjustment");
      d.text(
        `Product: ${m.batch.medicine.name}\nBatch: ${m.batch.number}\nReference: ${businessReference(m.reference)}\nDate: ${m.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}\nReason: ${m.reason}`,
      );
      d.table(
        ["Description", "Value"],
        [
          ["Adjustment in base units", String(m.quantity)],
          ["Original batch unit cost PKR", amountText(m.batch.cost)],
          [
            "Inventory cost impact PKR",
            amountText(D(m.quantity.toString()).mul(m.batch.cost.toString())),
          ],
        ],
        [0.7, 0.3],
        [1],
      );
      d.text(
        "Financial impact: adjusts stock and inventory cost. Does not create a customer payment or sale.",
      );
    } else if (kind === "credit-note") {
      requireRole(actor(r), managers);
      const n = await db.creditNote.findUniqueOrThrow({ where: { id } });
      const c = await db.customer.findUniqueOrThrow({
        where: { id: n.customerId },
      });
      const entry = await db.customerLedger.findFirst({
        where: { customerId: c.id, reference: n.id, type: "CREDIT_NOTE" },
      });
      if (entry) {
        const prior = await db.customerLedger.findMany({
          where: { customerId: c.id, sequence: { lt: entry.sequence } },
        });
        const before = prior.reduce(
          (sum, e) => sum.plus(e.debit.toString()).minus(e.credit.toString()),
          D(0),
        );
        d.text(
          `Original net ledger balance: PKR ${amountText(before)}\nBalance after adjustment: PKR ${amountText(before.minus(n.amount.toString()))}\nMethod: Ledger credit adjustment`,
        );
      }
      d.text(
        `Customer: ${c.name}\nDate: ${n.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}\nReference: ${businessReference(n.reference)}\nReason: ${n.reason}`,
      );
      d.table(
        ["Financial impact", "PKR"],
        [
          [
            "Credit reducing receivables / authorized advance",
            amountText(n.amount),
          ],
        ],
        [0.7, 0.3],
        [1],
      );
    } else throw new Error("Unsupported document");
    send(res, d.finish());
  });
  route("get", "/business-reports/:kind", async (r: any, res: any) => {
    requireRole(actor(r), managers);
    const kind = String(r.params.kind),
      d = businessDocument(
        await settings(),
        kind.toUpperCase(),
        String(r.query.paper || "A4"),
      );
    if (kind === "suppliers") {
      const rows = await db.supplier.findMany({ orderBy: { name: "asc" } });
      d.text(
        "Opening payable only; supplier payments and ongoing payable accounting are not implemented.",
      );
      d.table(
        ["Supplier", "Contact", "Phone", "Address", "Opening payable"],
        rows.map((s) => [
          s.name,
          s.contactPerson,
          s.phone,
          s.address,
          amountText(s.openingPayable),
        ]),
      );
    } else if (kind === "reorder") {
      const rows = await reorderReport(r.query);
      d.table(
        [
          "Medicine",
          "Sellable",
          "Minimum",
          "Reorder",
          "Target",
          "Required / base unit",
        ],
        rows.map((m) => [
          m.name,
          m.available,
          m.minimum,
          m.reorderLevel,
          m.target,
          `${m.required} ${m.baseUnit}`,
        ]),
      );
    } else throw new Error("Unsupported report");
    send(res, d.finish());
  });
}
