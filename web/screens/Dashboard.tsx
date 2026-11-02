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
export default function Dashboard(c: any) {
  const data = useData(
    "/reports?from=" +
      new Date(Date.parse(day() + "T12:00:00Z") - 6 * 86400000)
        .toISOString()
        .slice(0, 10) +
      "&to=" +
      day(),
    c.version,
    c.setError,
  );
  const daily = useData("/reports", c.version, c.setError);
  if (!data || !daily)
    return <div className="loading">Loading store activity…</div>;
  const s = daily.summary,
    max = Math.max(1, ...data.trend.map((d: any) => Number(d.total)));
  return (
    <>
      <div className="welcome-band">
        <div>
          <Badge tone="green">STORE OVERVIEW</Badge>
          <h2>Good business starts with a clear picture.</h2>
          <p>Here’s how your store is doing today.</p>
        </div>
        <Button onClick={() => c.setPage("POS / Sales")}>
          <Plus size={18} /> New sale
        </Button>
      </div>
      <div className="stats">
        {[
          ["Today's sales", pk(s.sales), Wallet, "teal"],
          ["Today's gross profit", pk(s.profit), BarChart3, "blue"],
          ["Today's purchases", pk(s.purchases), ShoppingBag, "violet"],
          ["Sellable stock value", pk(s.sellableValue), Package, "amber"],
        ].map(([label, value, Icon, tone]: any) => (
          <div className="stat" key={label}>
            <div>
              <span>{label}</span>
              <i className={tone}>
                <Icon size={20} />
              </i>
            </div>
            <strong>{value}</strong>
            <small>
              {label === "Sellable stock value"
                ? "Actual batch acquisition cost"
                : "Posted transactions · today"}
            </small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card sales-chart">
          <div className="card-title">
            <div>
              <h2>Sales performance</h2>
              <p>Your last 7 days at a glance</p>
            </div>
            <Badge>Last 7 days</Badge>
          </div>
          <div className="chart">
            <div className="chart-grid">
              <span>{pk(max)}</span>
              <span>{pk(max / 2)}</span>
              <span>PKR 0</span>
            </div>
            <div className="bars">
              {data.trend.map((d: any) => (
                <div className="bar-col" key={d.date}>
                  <div className="bar-value">{pk(d.total)}</div>
                  <div className="bar-track">
                    <div
                      title={pk(d.total)}
                      style={{ height: `${(Number(d.total) / max) * 100}%` }}
                    />
                  </div>
                  <span>
                    {new Date(d.date + "T12:00:00").toLocaleDateString(
                      "en-GB",
                      { weekday: "short" },
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="card">
          <div className="card-title">
            <div>
              <h2>Stock health</h2>
              <p>A little attention goes a long way</p>
            </div>
            <ShieldCheck size={21} />
          </div>
          {[
            ["Low stock medicines", s.lowStock, "amber"],
            ["Batches nearing expiry", s.nearExpiry, "blue"],
            ["Expired batches", s.expired, "red"],
            ["Today's invoices", s.invoiceCount, "green"],
          ].map(([l, n, t]: any) => (
            <div className="health-row" key={l}>
              <span>
                <i className={"status-dot " + t} />
                {l}
              </span>
              <Badge tone={t}>{n}</Badge>
            </div>
          ))}
          <button className="text-link" onClick={() => c.setPage("Inventory")}>
            Review inventory <ArrowUpRight size={16} />
          </button>
        </section>
        <section className="card">
          <div className="card-title">
            <div>
              <h2>Recent sales</h2>
              <p>Latest transactions at your counter</p>
            </div>
            <button
              className="text-link"
              onClick={() => c.setPage("POS / Sales")}
            >
              View all <ChevronRight size={16} />
            </button>
          </div>
          <Table
            rows={daily.sales.slice(0, 5)}
            columns={[
              {
                label: "Invoice",
                render: (r) => <b>#{r.number.toString().padStart(5, "0")}</b>,
              },
              {
                label: "Time",
                render: (r) =>
                  new Date(r.createdAt).toLocaleTimeString("en-GB", {
                    timeZone: "Asia/Karachi",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
              },
              {
                label: "Payment",
                render: (r) => <Badge>{r.payments[0]?.method}</Badge>,
              },
              { label: "Amount", render: (r) => <b>{pk(r.total)}</b> },
            ]}
          />
        </section>
        <section className="card">
          <div className="card-title">
            <div>
              <h2>Top medicines</h2>
              <p>Most sold in the last 7 days</p>
            </div>
            <Pill size={20} />
          </div>
          {data.top.slice(0, 10).map((m: any, i: number) => (
            <div className="top-medicine" key={m.name}>
              <span className="rank">{i + 1}</span>
              <div>
                <b>{m.name}</b>
                <small>{m.quantity} base units sold</small>
              </div>
              <strong>{pk(m.revenue)}</strong>
            </div>
          ))}
          {!data.top.length && (
            <Empty text="Your top sellers will appear after the first sale." />
          )}
        </section>
        <section className="card">
          <div className="card-title">
            <div>
              <h2>Recent purchases</h2>
              <p>Posted supplier invoices · today</p>
            </div>
            <button
              className="text-link"
              onClick={() => c.setPage("Purchases")}
            >
              View purchases <ChevronRight size={16} />
            </button>
          </div>
          <Table
            rows={daily.purchases.slice(0, 5)}
            columns={[
              { label: "Invoice", render: (r) => <b>PUR-{r.number}</b> },
              { label: "Supplier", render: (r) => r.supplier.name },
              { label: "Total", render: (r) => pk(r.total) },
            ]}
          />
        </section>
        <section className="card">
          <div className="card-title">
            <div>
              <h2>Needs your attention</h2>
              <p>Low stock and expiry alerts</p>
            </div>
            <AlertTriangle size={20} />
          </div>
          {daily.alerts.slice(0, 5).map((m: Row) => (
            <div className="health-row" key={m.id}>
              <span>{m.name}</span>
              <Badge tone="amber">{m.stock} left</Badge>
            </div>
          ))}
          {daily.expiryAlerts.slice(0, 5).map((b: Row) => (
            <div className="health-row" key={b.id}>
              <span>
                {b.medicine.name} · {b.number}
              </span>
              <Badge tone={b.expiry < day() ? "red" : "amber"}>
                {fmt(b.expiry)}
              </Badge>
            </div>
          ))}
          {!daily.alerts.length && !daily.expiryAlerts.length && (
            <Empty text="Your shelves are looking healthy. No alerts today." />
          )}
        </section>
      </div>
    </>
  );
}
