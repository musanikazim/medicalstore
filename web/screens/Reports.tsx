import CreditReports from "./CreditReports";
import React, { useState, useEffect, useRef } from "react";
import Decimal from "decimal.js";
import {
  Activity,
  LayoutDashboard,
  Pill,
  ShoppingBag,
  ScanLine,
  Package,
  BarChart3,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Menu,
  X,
  Trash2,
  Printer,
  Download,
  Check,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Wallet,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { readSheet, exportSheet } from "../spreadsheets";
import {
  api,
  pk,
  day,
  fmt,
  Row,
  Badge,
  Empty,
  Modal,
  Field,
  Table,
  useData,
} from "../shared";
export default function Reports(c: any) {
  const [from, setFrom] = useState(day()),
    [to, setTo] = useState(day()),
    [kind, setKind] = useState("sales");
  const [medicine, setMedicine] = useState(""),
    [supplier, setSupplier] = useState("");
  const suppliers = useData("/suppliers", c.version, c.setError) || [];
  const data = useData(
    "/reports?from=" +
      from +
      "&to=" +
      to +
      "&medicineId=" +
      medicine +
      "&supplierId=" +
      supplier,
    c.version,
    c.setError,
  );
  const kinds = [
    "sales",
    "purchases",
    "inventory",
    "profit",
    "returns",
    "movements",
    "medicineSales",
    "supplierPurchases",
    "daily",
    "inventorySummary",
    "lowStock",
    "outOfStock",
    "nearExpiry",
    "expired",
    "adjustments",
  ];
  if (!data) return <div className="loading">Preparing reports…</div>;
  const rows = kind === "profit" ? data.sales : data[kind];
  const selected = rows;
  const names: Record<string, string> = {
    sales: "Sales",
    purchases: "Purchases",
    inventory: "Batch inventory",
    profit: "Invoice gross profit",
    returns: "Returns",
    movements: "Stock movements",
    medicineSales: "Medicine sales & profit",
    supplierPurchases: "Supplier purchases",
    daily: "Daily sales, purchases & profit",
    inventorySummary: "Inventory reconciliation",
    lowStock: "Low stock",
    outOfStock: "Out of stock",
    nearExpiry: "Near expiry",
    expired: "Expired stock",
    adjustments: "Stock adjustments",
  };
  const columns: { label: string; render: (r: Row) => React.ReactNode }[] = [
    "inventory",
    "nearExpiry",
    "expired",
  ].includes(kind)
    ? [
        { label: "Medicine", render: (r) => r.medicine.name },
        { label: "Batch", render: (r) => r.number },
        { label: "Expiry", render: (r) => fmt(r.expiry) },
        { label: "Stock", render: (r) => r.quantity },
        { label: "Status", render: (r) => <Badge>{r.status}</Badge> },
        { label: "Cost", render: (r) => pk(r.cost) },
        {
          label: "Value",
          render: (r) => pk(new Decimal(r.cost).mul(r.quantity).toString()),
        },
      ]
    : ["movements", "adjustments"].includes(kind)
      ? [
          { label: "Date", render: (r) => fmt(r.effectiveDate || r.createdAt) },
          { label: "Medicine", render: (r) => r.batch.medicine.name },
          { label: "Type", render: (r) => r.type },
          { label: "Quantity", render: (r) => r.quantity },
          { label: "Reason", render: (r) => r.reason },
        ]
      : [
            "medicineSales",
            "supplierPurchases",
            "daily",
            "inventorySummary",
            "lowStock",
            "outOfStock",
          ].includes(kind)
        ? Object.keys(rows[0] || {})
            .filter((k) => !["medicineId", "supplierId", "id"].includes(k))
            .map((k) => ({
              label: k.replace(/([A-Z])/g, " $1"),
              render: (r: Row) =>
                [
                  "sales",
                  "cogs",
                  "profit",
                  "value",
                  "net",
                  "purchases",
                  "returns",
                ].includes(k)
                  ? pk(r[k])
                  : String(r[k]),
            }))
        : kind === "returns"
          ? [
              { label: "Date", render: (r) => fmt(r.createdAt) },
              { label: "Type", render: (r) => r.type },
              { label: "Quantity", render: (r) => r.quantity },
              { label: "Amount", render: (r) => pk(r.amount) },
              { label: "Reason", render: (r) => r.reason },
            ]
          : [
              { label: "Invoice", render: (r) => <b>#{r.number}</b> },
              { label: "Date", render: (r) => fmt(r.createdAt) },
              {
                label: kind === "purchases" ? "Supplier" : "Items",
                render: (r) => r.supplier?.name || r.lines.length,
              },
              { label: "Total", render: (r) => pk(r.total) },
              ...(kind === "profit"
                ? [
                    { label: "COGS", render: (r: Row) => pk(r.cogs) },
                    {
                      label: "Gross profit",
                      render: (r: Row) =>
                        pk(new Decimal(r.total).minus(r.cogs).toString()),
                    },
                  ]
                : []),
            ];

  return (
    <>
      <CreditReports {...c} />
      <section className="card report-filters">
        <Field label="From date" type="date" value={from} set={setFrom} />
        <Field label="To date" type="date" value={to} set={setTo} />
        <Field
          label="Report"
          value={kind}
          set={setKind}
          options={kinds.map((k) => ({ value: k, label: names[k] }))}
        />
        <Field
          label="Medicine"
          value={medicine}
          set={setMedicine}
          options={[
            { value: "", label: "All medicines" },
            ...c.medicines.map((m: Row) => ({ value: m.id, label: m.name })),
          ]}
        />
        <Field
          label="Purchase supplier"
          value={supplier}
          set={setSupplier}
          options={[
            { value: "", label: "All suppliers" },
            ...suppliers.map((s: Row) => ({ value: s.id, label: s.name })),
          ]}
        />
        <div className="export-actions">
          {["csv", "xlsx", "pdf"].map((f) => (
            <a
              key={f}
              className="button secondary"
              href={`/api/reports/export?from=${from}&to=${to}&kind=${kind}&format=${f}&medicineId=${medicine}&supplierId=${supplier}`}
            >
              <Download size={15} />
              {f.toUpperCase()}
            </a>
          ))}
        </div>
      </section>
      <div className="mini-stats">
        <div>
          <small>Net sales after returns</small>
          <strong>{pk(data.summary.sales)}</strong>
        </div>
        <div>
          <small>Gross profit after returns</small>
          <strong>{pk(data.summary.profit)}</strong>
        </div>
        <div>
          <small>Purchases after returns</small>
          <strong>{pk(data.summary.purchases)}</strong>
        </div>
        <div>
          <small>Current Inventory Value (Purchase Cost)</small>
          <strong>{pk(data.summary.stockValue)}</strong>
        </div>
        <div>
          <small>Current Inventory Value (Selling Price)</small>
          <strong>{pk(data.summary.inventorySellingValue)}</strong>
        </div>
      </div>
      <section className="card">
        <div className="card-title">
          <div>
            <h2>{names[kind]} report</h2>
            <p>
              {["inventory", "nearExpiry", "expired"].includes(kind)
                ? "Current snapshot"
                : fmt(from) + " — " + fmt(to)}{" "}
              · Amounts in PKR
            </p>
          </div>
          <Button secondary onClick={() => window.print()}>
            <Printer size={16} />
            Print
          </Button>
        </div>
        <Table rows={selected} columns={columns} />
        {kind === "profit" && (
          <p className="report-note">
            Rows show original invoice profit. Summary totals and exported
            profit reports also deduct linked sales returns.
          </p>
        )}
      </section>
    </>
  );
}
