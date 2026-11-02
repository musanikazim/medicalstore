import { ExpiryBadge } from "../components/expiry";
import { expiryStatus, expiryThreshold } from "../../shared/expiry";
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
  useMedicineSearch,
} from "../shared";
import ReturnForm from "./ReturnForm";
export default function POS(c: any) {
  const [q, setQ] = useState(""),
    [cart, setCart] = useState<Row[]>([]),
    [payment, setPayment] = useState(c.settings.defaultPayment || "CASH"),
    [tendered, setTendered] = useState(0),
    [discount, setDiscount] = useState(0),
    [prescription, setPrescription] = useState(""),
    [tab, setTab] = useState("Counter"),
    [receipt, setReceipt] = useState<Row | null>(null),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [submitted, setSubmitted] = useState(false),
    [returnLine, setReturnLine] = useState<Row | null>(null),
    [saleQuery, setSaleQuery] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const input = useRef<HTMLInputElement>(null),
    submitRef = useRef<() => void>(() => {});
  const receiptRef = useRef<Row | null>(null);
  receiptRef.current = receipt;
  const sales = useData("/sales", c.version, c.setError) || [];
  useEffect(() => input.current?.focus(), [tab]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        submitRef.current();
      }
      if (e.key === "F9" && receiptRef.current) {
        e.preventDefault();
        window.open(
          "/api/sales/" + receiptRef.current.id + "/receipt",
          "_blank",
          "noopener",
        );
      }
      if (e.key === "F2") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const searched = useMedicineSearch(q, c.version, c.medicines, c.setError);
  const results = searched.filter(
    (m: Row) =>
      m.active &&
      [m.name, m.generic, m.barcode].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
  );
  const changed = () => {
    setKey(crypto.randomUUID());
    setSubmitted(false);
  };
  const add = (m: Row) => {
    if (submitted) {
      c.setError("Retry or resolve the pending sale before changing the cart.");
      return;
    }
    const unit =
      m.sellingUnit === "base" && !m.looseAllowed
        ? "strip"
        : m.sellingUnit || "base";
    setCart((previous) => {
      const old = previous.find(
        (l) => l.medicineId === m.id && l.unit === unit,
      );
      return old
        ? previous.map((l) =>
            l === old ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [
            ...previous,
            { medicineId: m.id, medicine: m, unit, quantity: 1, discount: 0 },
          ];
    });
    changed();
    setQ("");
    input.current?.focus();
  };
  const factor = (l: Row) =>
    l.unit === "box"
      ? l.medicine.unitsPerStrip * l.medicine.stripsPerBox
      : l.unit === "strip"
        ? l.medicine.unitsPerStrip
        : 1;
  const price = (l: Row) =>
    Number(
      l.unit === "box"
        ? (l.medicine.boxPrice ?? Number(l.medicine.salePrice) * factor(l))
        : l.unit === "strip"
          ? (l.medicine.stripPrice ?? Number(l.medicine.salePrice) * factor(l))
          : l.medicine.salePrice,
    );
  const subtotal = cart
      .reduce(
        (s, l) =>
          s.plus(
            new Decimal(price(l))
              .mul(l.quantity)
              .minus(l.discount)
              .toDecimalPlaces(2),
          ),
        new Decimal(0),
      )
      .toNumber(),
    total = new Decimal(subtotal).minus(discount || 0).toNumber();
  const complete = () => {
    if (c.busy || !cart.length) return;
    setSubmitted(true);
    c.run(
      () =>
        api("/sales", {
          key,
          lines: cart.map(({ medicine, ...l }) => l),
          discount,
          payment,
          tendered,
          prescriptionReference: prescription,
        }),
      "Sale completed. Stock updated.",
    )
      .then((r: Row) => {
        setCart([]);
        setDiscount(0);
        setTendered(0);
        setPrescription("");
        changed();
        setReceipt(r);
        input.current?.focus();
      })
      .catch(() => {});
  };
  submitRef.current = complete;
  return (
    <>
      <div className="tab-bar">
        {["Counter", "Sales history"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
        <span className="shortcut-hint">
          F2 Search · F8 Complete sale · F9 Receipt
        </span>
      </div>
      {tab === "Counter" ? (
        <div className="pos-layout">
          <section className="card medicine-picker">
            <div className="toolbar">
              <div className="search">
                <ScanLine size={20} />
                <input
                  ref={input}
                  aria-label="Scan barcode or search medicines"
                  placeholder="Scan barcode, search medicine or generic…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      try {
                        const local = results.find((m: Row) => m.barcode === q);
                        const matches = local
                          ? [local]
                          : q
                            ? await api("/medicines?q=" + encodeURIComponent(q))
                            : results;
                        const match =
                          matches.find((m: Row) => m.barcode === q) ||
                          matches[0];
                        if (match) add(match);
                        else
                          c.setError(
                            "No medicine matches this barcode or search",
                          );
                      } catch (e: any) {
                        c.setError(e.message);
                      }
                    }
                  }}
                />
              </div>
              <Badge>Keyboard ready</Badge>
            </div>
            <div className="product-grid">
              {results.slice(0, 60).map((m: Row) => (
                <button
                  className="product"
                  key={m.id}
                  disabled={!m.available || submitted}
                  onClick={() => add(m)}
                >
                  <span className="pill-icon">
                    <Pill size={24} />
                  </span>
                  <Badge
                    tone={m.available <= m.minimumStock ? "amber" : "green"}
                  >
                    {m.available} available
                  </Badge>
                  <h3>{m.name}</h3>
                  <p>
                    {m.strength} · {m.form}
                  </p>
                  <small>{m.generic}</small>
                  {m.nextExpiry &&
                    expiryStatus(
                      m.nextExpiry,
                      expiryThreshold(c.settings),
                      c.businessDate || day(),
                    ).status !== "NORMAL" && (
                      <div className="expiry-badge">
                        <ExpiryBadge
                          expiry={m.nextExpiry}
                          settings={c.settings}
                          date={c.businessDate || day()}
                        />
                      </div>
                    )}
                  <div>
                    <strong>{pk(m.salePrice)}</strong>
                    <span>/ {m.baseUnit}</span>
                    <Plus size={18} />
                  </div>
                  {m.prescription && (
                    <small className="rx">Prescription required</small>
                  )}
                </button>
              ))}
            </div>
            {!results.length && (
              <Empty text="No medicines match your search." />
            )}
          </section>
          <section className="card cart">
            <div className="card-title">
              <div>
                <h2>Current sale</h2>
                <p>{cart.length} items at your counter</p>
              </div>
              <ShoppingBag size={21} />
            </div>
            <div className="cart-items">
              {!cart.length && (
                <Empty text="Scan or select a medicine to start billing." />
              )}
              {cart.map((l, i) => (
                <div className="cart-line" key={i}>
                  <div>
                    <b>{l.medicine.name}</b>
                    <button
                      aria-label="Remove cart item"
                      disabled={submitted}
                      onClick={() => {
                        setCart(cart.filter((_, n) => i !== n));
                        changed();
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <small>
                    {l.medicine.strength} · {pk(price(l))} / {l.unit}
                  </small>
                  <div className="quantity-row">
                    <input
                      aria-label={"Quantity for " + l.medicine.name}
                      type="number"
                      min="1"
                      step="1"
                      value={l.quantity}
                      disabled={submitted}
                      onChange={(e) => {
                        setCart(
                          cart.map((v, n) =>
                            n === i
                              ? { ...v, quantity: Number(e.target.value) }
                              : v,
                          ),
                        );
                        changed();
                      }}
                    />
                    <select
                      aria-label={"Unit for " + l.medicine.name}
                      value={l.unit}
                      disabled={submitted}
                      onChange={(e) => {
                        setCart(
                          cart.map((v, n) =>
                            n === i ? { ...v, unit: e.target.value } : v,
                          ),
                        );
                        changed();
                      }}
                    >
                      {(l.medicine.looseAllowed
                        ? ["base", "strip", "box"]
                        : ["strip", "box"]
                      ).map((u) => (
                        <option key={u} value={u}>
                          {u === "base" ? l.medicine.baseUnit : u}
                        </option>
                      ))}
                    </select>
                    <strong>
                      {pk(
                        new Decimal(price(l))
                          .mul(l.quantity)
                          .minus(l.discount)
                          .toDecimalPlaces(2)
                          .toString(),
                      )}
                    </strong>
                  </div>
                  {(c.user.role !== "CASHIER" ||
                    Number(c.settings.cashierDiscountPercent || 0) > 0) && (
                    <Field
                      label="Line discount PKR"
                      type="number"
                      min="0"
                      value={l.discount}
                      disabled={submitted}
                      set={(v: any) => {
                        setCart(
                          cart.map((x, n) =>
                            n === i ? { ...x, discount: v } : x,
                          ),
                        );
                        changed();
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="cart-summary">
              <div>
                <span>Subtotal</span>
                <b>{pk(subtotal)}</b>
              </div>
              {(c.user.role !== "CASHIER" ||
                Number(c.settings.cashierDiscountPercent || 0) > 0) && (
                <Field
                  label="Invoice discount PKR"
                  type="number"
                  value={discount}
                  min="0"
                  disabled={submitted}
                  set={(v: any) => {
                    setDiscount(v);
                    changed();
                  }}
                />
              )}
              <Field
                label="Prescription reference (when required)"
                value={prescription}
                disabled={submitted}
                set={(v: any) => {
                  setPrescription(v);
                  changed();
                }}
              />
              <div className="grand-total">
                <span>Total payable</span>
                <strong>{pk(total)}</strong>
              </div>
              <Field
                label="Payment method"
                value={payment}
                disabled={submitted}
                set={(v: any) => {
                  setPayment(v);
                  changed();
                }}
                options={["CASH", "CARD", "RAAST", "OTHER"]}
              />
              {payment === "CASH" && (
                <>
                  <Field
                    label="Cash received PKR"
                    type="number"
                    min="0"
                    value={tendered}
                    disabled={submitted}
                    set={(v: any) => {
                      setTendered(v);
                      changed();
                    }}
                  />
                  <div>
                    <span>Change</span>
                    <b>{pk(Math.max(0, tendered - total))}</b>
                  </div>
                </>
              )}
              <Button disabled={c.busy || !cart.length} onClick={complete}>
                <Check size={18} />
                {submitted ? "Retry same sale" : "Complete sale"}
                <kbd>F8</kbd>
              </Button>
              {submitted && (
                <p className="pending-note">
                  The cart is locked to prevent duplicate billing. Retry the
                  same request. If validation failed, unlock and correct it.
                </p>
              )}
              {cart.length > 0 && (
                <button
                  className="text-link"
                  onClick={() => {
                    if (
                      window.confirm(
                        submitted
                          ? "Verify sales history before discarding a request with an uncertain result. Unlock cart?"
                          : "Cancel this unposted cart?",
                      )
                    ) {
                      if (!submitted) setCart([]);
                      changed();
                    }
                  }}
                >
                  {submitted ? "Unlock after checking history" : "Cancel sale"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : (
        <section className="card">
          <div className="card-title">
            <h2>Sales history</h2>
            <span>
              {c.user.role === "CASHIER"
                ? "Your transactions"
                : "All store transactions"}
            </span>
          </div>
          <div className="toolbar">
            <Field
              label="Search invoice or medicine"
              value={saleQuery}
              set={setSaleQuery}
            />
            <Field label="Sales from" type="date" value={from} set={setFrom} />
            <Field label="Sales to" type="date" value={to} set={setTo} />
          </div>
          <Table
            rows={sales.filter(
              (s: Row) =>
                (!from ||
                  new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Karachi",
                  }).format(new Date(s.createdAt)) >= from) &&
                (!to ||
                  new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Karachi",
                  }).format(new Date(s.createdAt)) <= to) &&
                (
                  String(s.number) +
                  " " +
                  s.lines.map((l: Row) => l.name).join(" ")
                )
                  .toLowerCase()
                  .includes(saleQuery.toLowerCase()),
            )}
            onRow={setReceipt}
            columns={[
              {
                label: "Invoice",
                render: (r) => <b>MS-{String(r.number).padStart(5, "0")}</b>,
              },
              { label: "Date", render: (r) => fmt(r.createdAt) },
              { label: "Items", render: (r) => r.lines.length },
              {
                label: "Payment",
                render: (r) => <Badge>{r.payments[0]?.method}</Badge>,
              },
              { label: "Total", render: (r) => <b>{pk(r.total)}</b> },
              { label: "", render: () => <Printer size={16} /> },
            ]}
          />
        </section>
      )}
      {receipt && (
        <Modal
          title={"Sale MS-" + receipt.number}
          close={() => setReceipt(null)}
          wide
        >
          {receipt.change !== undefined && (
            <div className="sale-success">
              <Check size={28} />
              <h2>Sale completed</h2>
              <p>
                Total {pk(receipt.total)} · Change {pk(receipt.change)}
              </p>
            </div>
          )}
          {receipt.lines && (
            <Table
              rows={receipt.lines}
              columns={[
                { label: "Medicine", render: (r) => r.name },
                { label: "Quantity", render: (r) => r.quantity + " " + r.unit },
                { label: "Total", render: (r) => pk(r.net) },
                {
                  label: "Batch allocations",
                  render: (r) =>
                    r.allocations.map((a: Row) => (
                      <div key={a.id}>
                        <small>
                          {a.batch?.number || a.batchId.slice(0, 8)} ·{" "}
                          {a.quantity} base units · {a.returned} returned
                        </small>
                        {(c.user.role !== "CASHIER" ||
                          Number(c.settings.cashierDiscountPercent || 0) > 0) &&
                          a.returned < a.quantity && (
                            <button
                              className="text-link"
                              onClick={() => setReturnLine(a)}
                            >
                              Return units
                            </button>
                          )}
                      </div>
                    )),
                },
              ]}
            />
          )}
          <div className="modal-actions">
            <a
              className="button"
              href={"/api/sales/" + receipt.id + "/receipt"}
              target="_blank"
              rel="noreferrer"
            >
              <Printer size={17} />
              Open receipt / PDF
            </a>
            <Button secondary onClick={() => setReceipt(null)}>
              Done
            </Button>
          </div>
        </Modal>
      )}
      {returnLine && (
        <ReturnForm
          c={c}
          type="SALE"
          original={returnLine}
          close={() => setReturnLine(null)}
        />
      )}
    </>
  );
}
