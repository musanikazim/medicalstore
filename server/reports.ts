import { qty } from "./core";
import { expiryStatus, expiryThreshold } from "../shared/expiry";
import { Prisma } from "@prisma/client";
import { db, D, money, date, today } from "./engine";
export async function report(
  from: string,
  to: string,
  medicineId?: string,
  supplierId?: string,
) {
  date.parse(from);
  date.parse(to);
  if (from > to) throw new Error("Start date must precede end date");
  const start = new Date(from + "T00:00:00+05:00"),
    end = new Date(to + "T23:59:59.999+05:00");
  return db.$transaction(
    async (t) => {
      const [rawSales, rawPurchases, returns, batches, settings] =
        await Promise.all([
          t.sale.findMany({
            where: {
              createdAt: { gte: start, lte: end },
              ...(medicineId ? { lines: { some: { medicineId } } } : {}),
            },
            include: { lines: true, payments: true },
            orderBy: { createdAt: "desc" },
          }),
          t.purchase.findMany({
            where: {
              status: "POSTED",
              postedAt: { gte: start, lte: end },
              ...(supplierId ? { supplierId } : {}),
              ...(medicineId ? { lines: { some: { medicineId } } } : {}),
            },
            include: { supplier: true, lines: true },
          }),
          t.returnRecord.findMany({
            where: { createdAt: { gte: start, lte: end } },
          }),
          t.batch.findMany({
            where: {
              ...(medicineId ? { medicineId } : {}),
              ...(supplierId
                ? { purchaseLine: { purchase: { supplierId } } }
                : {}),
            },
            include: { medicine: true },
          }),
          t.settings.findUnique({ where: { id: "store" } }),
        ]);
      const sales = rawSales.map((s) => {
        if (!medicineId) return s;
        const lines = s.lines.filter((l) => l.medicineId === medicineId);
        return {
          ...s,
          lines,
          tax: new Prisma.Decimal(
            lines.reduce((v, l) => v.plus(l.tax.toString()), D(0)).toFixed(6),
          ),
          total: new Prisma.Decimal(
            lines
              .reduce(
                (v, l) => v.plus(l.net.toString()).plus(l.tax.toString()),
                D(0),
              )
              .toFixed(6),
          ),
          cogs: new Prisma.Decimal(
            lines.reduce((v, l) => v.plus(l.cogs.toString()), D(0)).toFixed(6),
          ),
        };
      });
      const purchases = rawPurchases.map((p) => {
        if (!medicineId) return p;
        const all = p.lines.reduce((v, l) => v.plus(l.net.toString()), D(0));
        const lines = p.lines.filter((l) => l.medicineId === medicineId);
        const selected = lines.reduce((v, l) => v.plus(l.net.toString()), D(0));
        const ratio = all.isZero()
          ? D(lines.length).div(p.lines.length)
          : selected.div(all);
        return {
          ...p,
          lines,
          total: new Prisma.Decimal(
            money(D(p.total.toString()).mul(ratio)).toFixed(6),
          ),
        };
      });
      const saleReturnBatches = medicineId
        ? await t.batch.findMany({
            where: { medicineId },
            select: { id: true },
          })
        : [];
      const saleReturnBatchIds = saleReturnBatches.map((b) => b.id);
      const batchIds = batches.map((b) => b.id);
      const filteredReturns =
        medicineId || supplierId
          ? returns.filter((r) =>
              r.type === "SALE"
                ? !medicineId || saleReturnBatchIds.includes(r.batchId)
                : batchIds.includes(r.batchId),
            )
          : returns;
      const movements = await t.movement.findMany({
        where: {
          OR: [
            { effectiveDate: { gte: from, lte: to } },
            { effectiveDate: "", createdAt: { gte: start, lte: end } },
          ],
          ...(medicineId || supplierId ? { batchId: { in: batchIds } } : {}),
        },
        include: { batch: { include: { medicine: true } } },
        orderBy: { createdAt: "desc" },
      });
      const sum = (rows: any[], key: string) =>
        rows.reduce((s, x) => s.plus(x[key].toString()), D(0));
      const sr = filteredReturns.filter((r) => r.type === "SALE"),
        pr = filteredReturns.filter((r) => r.type === "PURCHASE");
      const revenue = sum(sales, "total")
          .minus(sum(sales, "tax"))
          .minus(sum(sr, "amount").minus(sum(sr, "tax"))),
        cogs = sum(sales, "cogs").minus(sum(sr, "cogs"));
      const sellable = batches.filter(
        (b) => b.status === "SELLABLE" && b.expiry >= today(),
      );
      const inventoryValue = batches.reduce(
        (s, b) => s.plus(D(b.cost.toString()).mul(b.quantity)),
        D(0),
      );
      const availableValue = sellable.reduce(
        (s, b) => s.plus(D(b.cost.toString()).mul(b.quantity)),
        D(0),
      );
      const medicineRows = await t.medicine.findMany({
        where: { active: true, ...(medicineId ? { id: medicineId } : {}) },
      });
      const med = new Map<string, any>(
        medicineRows.map((m) => [
          m.id,
          { id: m.id, name: m.name, minimum: m.minimumStock, stock: 0 },
        ]),
      );
      for (const b of batches) {
        const existing = med.get(b.medicineId) || {
          id: b.medicineId,
          name: b.medicine.name,
          minimum: b.medicine.minimumStock,
          stock: 0,
        };
        if (b.status === "SELLABLE" && b.expiry >= today())
          existing.stock = qty(D(existing.stock).plus(b.quantity.toString()));
        med.set(b.medicineId, existing);
      }
      const days = expiryThreshold(settings?.data as any);
      const withinWarning = (expiry: string) =>
        ["SOON", "TODAY"].includes(expiryStatus(expiry, days, today()).status);
      const trend = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(Date.parse(to + "T12:00:00Z") - (6 - i) * 86400000)
          .toISOString()
          .slice(0, 10);
        return {
          date: d,
          total: sum(
            sales.filter(
              (s) =>
                new Intl.DateTimeFormat("en-CA", {
                  timeZone: "Asia/Karachi",
                }).format(s.createdAt) === d,
            ),
            "total",
          )
            .minus(
              sum(
                sales.filter(
                  (s) =>
                    new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Karachi",
                    }).format(s.createdAt) === d,
                ),
                "tax",
              ),
            )
            .toFixed(2),
        };
      });
      const top = new Map<string, any>();
      for (const s of sales)
        for (const l of s.lines) {
          const old = top.get(l.medicineId) || {
            name: l.name,
            quantity: 0,
            revenue: D(0),
          };
          old.quantity = qty(
            D(old.quantity).plus(
              D(l.quantity.toString()).mul(l.factor.toString()),
            ),
          );
          old.revenue = old.revenue.plus(l.net.toString());
          top.set(l.medicineId, old);
        }
      const dailyMap = new Map<string, any>();
      const dateKey = (value: Date) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(
          value,
        );
      const dailyRow = (key: string) => {
        if (!dailyMap.has(key))
          dailyMap.set(key, {
            date: key,
            sales: D(0),
            cogs: D(0),
            purchases: D(0),
          });
        return dailyMap.get(key);
      };
      const medicineMap = new Map<string, any>();
      const medicineRow = (id: string, name: string) => {
        if (!medicineMap.has(id))
          medicineMap.set(id, {
            medicineId: id,
            name,
            quantity: 0,
            returned: 0,
            sales: D(0),
            cogs: D(0),
          });
        return medicineMap.get(id);
      };
      const supplierMap = new Map<string, any>();
      const supplierRow = (id: string, name: string) => {
        if (!supplierMap.has(id))
          supplierMap.set(id, {
            supplierId: id,
            name,
            purchases: D(0),
            returns: D(0),
          });
        return supplierMap.get(id);
      };
      for (const sale of sales) {
        const d = dailyRow(dateKey(sale.createdAt));
        d.sales = d.sales
          .plus(sale.total.toString())
          .minus(sale.tax.toString());
        d.cogs = d.cogs.plus(sale.cogs.toString());
        for (const line of sale.lines) {
          const m = medicineRow(line.medicineId, line.name);
          m.quantity = qty(
            D(m.quantity).plus(
              D(line.quantity.toString()).mul(line.factor.toString()),
            ),
          );
          m.sales = m.sales.plus(line.net.toString());
          m.cogs = m.cogs.plus(line.cogs.toString());
        }
      }
      for (const p of purchases) {
        const d = dailyRow(dateKey(p.postedAt || p.createdAt));
        d.purchases = d.purchases.plus(p.total.toString());
        const sup = supplierRow(p.supplierId, p.supplier.name);
        sup.purchases = sup.purchases.plus(p.total.toString());
      }
      const returnedAllocations = await t.allocation.findMany({
        where: {
          id: {
            in: filteredReturns
              .filter((r) => r.type === "SALE")
              .map((r) => r.originalId),
          },
        },
        include: { saleLine: true },
      });
      const allocationMap = new Map(returnedAllocations.map((a) => [a.id, a]));
      const returnedPurchaseLines = await t.purchaseLine.findMany({
        where: {
          id: {
            in: filteredReturns
              .filter((r) => r.type === "PURCHASE")
              .map((r) => r.originalId),
          },
        },
        include: { purchase: { include: { supplier: true } } },
      });
      const purchaseLineMap = new Map(
        returnedPurchaseLines.map((l) => [l.id, l]),
      );
      for (const r of filteredReturns) {
        const d = dailyRow(dateKey(r.createdAt));
        if (r.type === "SALE") {
          d.sales = d.sales.minus(r.amount.toString()).plus(r.tax.toString());
          d.cogs = d.cogs.minus(r.cogs.toString());
          const allocation = allocationMap.get(r.originalId)!;
          const m = medicineRow(
            allocation.saleLine.medicineId,
            allocation.saleLine.name,
          );
          m.returned = qty(D(m.returned).plus(r.quantity.toString()));
          m.sales = m.sales.minus(r.amount.toString()).plus(r.tax.toString());
          m.cogs = m.cogs.minus(r.cogs.toString());
        } else {
          d.purchases = d.purchases.minus(r.amount.toString());
          const line = purchaseLineMap.get(r.originalId)!;
          const sup = supplierRow(
            line.purchase.supplierId,
            line.purchase.supplier.name,
          );
          sup.returns = sup.returns.plus(r.amount.toString());
        }
      }
      const allMoves = await t.movement.findMany({
        where: { batchId: { in: batchIds } },
      });
      const stockMap = new Map<string, any>();
      const batchMap = new Map(batches.map((b) => [b.id, b]));
      for (const b of batches) {
        if (!stockMap.has(b.medicineId))
          stockMap.set(b.medicineId, {
            medicineId: b.medicineId,
            name: b.medicine.name,
            opening: 0,
            purchased: 0,
            sold: 0,
            salesReturns: 0,
            purchaseReturns: 0,
            adjustments: 0,
            stock: 0,
            available: 0,
            value: D(0),
          });
        const row = stockMap.get(b.medicineId);
        row.stock = qty(D(row.stock).plus(b.quantity.toString()));
        if (b.status === "SELLABLE" && b.expiry >= today())
          row.available = qty(D(row.available).plus(b.quantity.toString()));
        row.value = row.value.plus(D(b.cost.toString()).mul(b.quantity));
      }
      for (const mv of allMoves) {
        const b = batchMap.get(mv.batchId);
        if (!b) continue;
        const row = stockMap.get(b.medicineId);
        const field = (
          {
            OPENING: "opening",
            PURCHASE: "purchased",
            SALE: "sold",
            SALE_RETURN: "salesReturns",
            PURCHASE_RETURN: "purchaseReturns",
            ADJUSTMENT: "adjustments",
          } as Record<string, string>
        )[mv.type];
        if (field)
          row[field] = qty(
            D(row[field]).plus(
              D(mv.quantity.toString()).mul(
                mv.type === "SALE" || mv.type === "PURCHASE_RETURN" ? -1 : 1,
              ),
            ),
          );
      }
      const medicineSales = [...medicineMap.values()].map((m) => ({
        ...m,
        sales: m.sales.toFixed(2),
        cogs: m.cogs.toFixed(2),
        profit: m.sales.minus(m.cogs).toFixed(2),
      }));
      const supplierPurchases = [...supplierMap.values()].map((p) => ({
        ...p,
        net: p.purchases.minus(p.returns).toFixed(2),
        purchases: p.purchases.toFixed(2),
        returns: p.returns.toFixed(2),
      }));
      const daily = [...dailyMap.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          ...d,
          profit: d.sales.minus(d.cogs).toFixed(2),
          sales: d.sales.toFixed(2),
          cogs: d.cogs.toFixed(2),
          purchases: d.purchases.toFixed(2),
        }));
      const inventorySummary = [...stockMap.values()].map((m) => ({
        ...m,
        value: m.value.toFixed(2),
      }));
      const customers = await t.customer.findMany({
        include: { accounts: true },
      });
      const outstanding = customers.reduce(
        (s, c) =>
          s
            .plus(c.openingOutstanding.toString())
            .plus(
              c.accounts.reduce(
                (n, x) =>
                  n
                    .plus(x.original.toString())
                    .minus(x.settled.toString())
                    .minus(x.returned.toString()),
                D(0),
              ),
            ),
        D(0),
      );
      const todayStart = new Date(today() + "T00:00:00+05:00"),
        todayEnd = new Date(today() + "T23:59:59.999+05:00");
      const todaySales = await t.sale.findMany({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
      });
      const todayCollections = await t.collection.findMany({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
      });
      const todayReversals = await t.collectionReversal.findMany({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
        include: { collection: true },
      });
      const sellingValue = sellable.reduce(
        (s, b) =>
          s.plus(D(b.quantity.toString()).mul(b.medicine.salePrice.toString())),
        D(0),
      );
      return {
        from,
        to,
        medicineSales,
        supplierPurchases,
        daily,
        inventorySummary,
        lowStock: [...med.values()].filter((m) => m.stock <= m.minimum),
        outOfStock: [...med.values()].filter((m) => m.stock === 0),
        nearExpiry: batches.filter(
          (b) => b.quantity.gt(0) && withinWarning(b.expiry),
        ),
        expired: batches.filter((b) => b.quantity.gt(0) && b.expiry < today()),
        adjustments: movements.filter((m) => m.type === "ADJUSTMENT"),
        summary: {
          sales: revenue.toFixed(2),
          profit: revenue.minus(cogs).toFixed(2),
          purchases: sum(purchases, "total")
            .minus(sum(pr, "amount"))
            .toFixed(2),
          inventorySellingValue: sellingValue.toFixed(2),
          customerOutstanding: outstanding.toFixed(2),
          todayCreditSales: todaySales
            .reduce((s, x) => s.plus(x.creditAmount.toString()), D(0))
            .toFixed(2),
          todayCustomerCollections: todayCollections
            .reduce((s, x) => s.plus(x.amount.toString()), D(0))
            .minus(
              todayReversals.reduce(
                (s, x) => s.plus(x.collection.amount.toString()),
                D(0),
              ),
            )
            .toFixed(2),
          stockValue: inventoryValue.toFixed(2),
          sellableValue: availableValue.toFixed(2),
          invoiceCount: sales.length,
          lowStock: [...med.values()].filter((m) => m.stock <= m.minimum)
            .length,
          nearExpiry: batches.filter(
            (b) => b.quantity.gt(0) && withinWarning(b.expiry),
          ).length,
          expired: batches.filter((b) => b.quantity.gt(0) && b.expiry < today())
            .length,
        },
        trend,
        top: [...top.values()]
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10)
          .map((x) => ({ ...x, revenue: x.revenue.toFixed(2) })),
        alerts: [...med.values()].filter((m) => m.stock <= m.minimum),
        expiryAlerts: batches.filter(
          (b) =>
            b.quantity.gt(0) && (withinWarning(b.expiry) || b.expiry < today()),
        ),
        inventory: batches,
        movements,
        sales,
        purchases,
        returns: filteredReturns,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
