import { unitsFor, unitPrice, unitFactor } from "../product-utils";
import { CustomerForm, PaymentFields } from "./Customers";
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
  const [customerId, setCustomerId] = useState(""),
    [customerSearch, setCustomerSearch] = useState(""),
    [quickCustomer, setQuickCustomer] = useState(false),
    [payments, setPayments] = useState<Row[]>([]),
    [notes, setNotes] = useState(""),
    [issues, setIssues] = useState<Row[]>([]),
    [draftVersion, bumpDrafts] = useState(0),
    [draftStatus, setDraftStatus] = useState("Not saved"),
    [recovery, setRecovery] = useState<Row | null>(null);
  const customers =
    useData(
      "/customers?q=" + encodeURIComponent(customerSearch),
      c.version,
      c.setError,
    ) || [];
  const banks = useData("/bank-accounts", c.version, c.setError) || [];
  const held =
    useData("/pos-drafts", c.version + draftVersion, c.setError) || [];
  const draft = useRef({ id: crypto.randomUUID(), version: 0 });
  const saveQueue = useRef<Promise<any>>(Promise.resolve());
  const mounted = useRef(true);
  const storageKey = "sehat-pos-" + c.user.id;
  const latest = useRef<Row>({});
  latest.current = {
    lines: cart.map(({ medicine, ...l }) => ({
      ...l,
      expectedPrice: l.expectedPrice ?? unitPrice(medicine, l.unit),
    })),
    discount,
    customerId: customerId || null,
    payments,
    payment,
    tendered,
    prescriptionReference: prescription,
    notes,
  };
  const saveNow = (status = "ACTIVE", data = latest.current) => {
    const identity = draft.current;
    const task = saveQueue.current
      .catch(() => {})
      .then(async () => {
        const saved = await api(
          "/pos-drafts/" + identity.id,
          { version: identity.version, status, data },
          "PUT",
        );
        identity.version = saved.version;
        if (mounted.current) setDraftStatus("Saved to store database");
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            id: identity.id,
            version: identity.version,
            data: latest.current,
          }),
        );
        return saved;
      });
    saveQueue.current = task;
    return task;
  };
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved?.data?.lines?.length) setRecovery(saved);
    } catch {}
    return () => {
      mounted.current = false;
      if (latest.current.lines?.length) saveNow().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!cart.length || recovery || submitted) return;
    const data = latest.current;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ ...draft.current, data }),
    );
    setDraftStatus("Saving…");
    const timer = setTimeout(
      () =>
        saveNow("ACTIVE", data).catch((e: any) => {
          setDraftStatus(
            "Recovery copy saved on this computer; database save failed",
          );
          c.setError(e.message);
        }),
      500,
    );
    return () => clearTimeout(timer);
  }, [
    cart,
    discount,
    customerId,
    payments,
    payment,
    tendered,
    prescription,
    notes,
    recovery,
    submitted,
  ]);
  const clearSale = () => {
    setCart([]);
    setDiscount(0);
    setTendered(0);
    setPrescription("");
    setCustomerId("");
    setPayments([]);
    setNotes("");
    setIssues([]);
    draft.current = { id: crypto.randomUUID(), version: 0 };
    localStorage.removeItem(storageKey);
    setRecovery(null);
    setDraftStatus("Not saved");
    bumpDrafts((v) => v + 1);
    changed();
  };
  const restore = async (id: string, useClientCopy = false) => {
    try {
      await saveQueue.current.catch(() => {});
      if (useClientCopy) {
        const local = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (local?.id === id)
          await api(
            "/pos-drafts/" + id,
            { version: local.version, status: "ACTIVE", data: local.data },
            "PUT",
          );
      }
      const r = await api("/pos-drafts/" + id + "/resume", {});
      draft.current = { id: r.id, version: r.version };
      const data = r.data;
      const mapped = [];
      for (const l of data.lines) {
        const m =
          r.products.find((m: Row) => m.id === l.medicineId) ||
          c.medicines.find((m: Row) => m.id === l.medicineId);
        mapped.push({
          ...l,
          snapshotBatchIds: m?.snapshotBatchIds || l.snapshotBatchIds || [],
          medicine: m || {
            id: l.medicineId,
            name: "Unavailable product",
            salePrice: 0,
            unitsPerStrip: 1,
            stripsPerBox: 1,
            looseAllowed: true,
          },
        });
      }
      setCart(mapped);
      setDiscount(Number(data.discount));
      setCustomerId(data.customerId || "");
      setPayments(data.payments || []);
      setPayment(data.payment || "CASH");
      setTendered(Number(data.tendered || 0));
      setPrescription(data.prescriptionReference || "");
      setNotes(data.notes || "");
      setIssues(r.issues);
      setRecovery(null);
      setSubmitted(false);
      setKey(crypto.randomUUID());
      bumpDrafts((v) => v + 1);
    } catch (e: any) {
      c.setError(e.message);
    }
  };
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
  const results = searched.filter((m: Row) => m.active);
  const changed = () => {
    setKey(crypto.randomUUID());
    setSubmitted(false);
    setIssues([]);
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
            {
              medicineId: m.id,
              medicine: m,
              unit,
              quantity: 1,
              discount: 0,
              expectedPrice: unitPrice(m, unit),
              serialNumbers: [],
              snapshotBatchIds: m.snapshotBatchIds || [],
            },
          ];
    });
    changed();
    setQ("");
    input.current?.focus();
  };
  const factor = (l: Row) => unitFactor(l.medicine, l.unit);
  const price = (l: Row) => unitPrice(l.medicine, l.unit);
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
    total = new Decimal(subtotal)
      .minus(discount || 0)
      .mul(new Decimal(1).plus(Number(c.settings.taxRate || 0) / 100))
      .toDecimalPlaces(2)
      .toNumber();
  const complete = () => {
    if (c.busy || !cart.length) return;
    setSubmitted(true);
    c.run(async () => {
      const saved =
        submitted && draft.current.version > 0
          ? draft.current
          : await saveNow();
      return api("/sales", {
        key,
        draftId: saved.id,
        draftVersion: saved.version,
        customerId: customerId || null,
        notes,
        ...(payments.length ? { payments } : {}),
        lines: cart.map(({ medicine, ...l }) => l),
        discount,
        payment,
        tendered,
        prescriptionReference: prescription,
      });
    }, "Sale completed. Stock updated.")
      .then((r: Row) => {
        clearSale();
        setReceipt(r);
        input.current?.focus();
      })
      .catch((e: any) => {
        setIssues(e.issues || []);
      });
  };
  submitRef.current = complete;
  return (
    <>
      {recovery && (
        <section className="card">
          <h3>Recover previous cart</h3>
          <p>
            Your last cart has {recovery.data.lines.length} items. Resume it to
            check current stock and prices.
          </p>
          <Button onClick={() => restore(recovery.id, true)}>
            Resume Draft
          </Button>
          <Button
            secondary
            onClick={async () => {
              try {
                const current = held.find((d: Row) => d.id === recovery.id);
                if (current)
                  await api("/pos-drafts/" + current.id + "/discard", {
                    version: current.version,
                  });
                clearSale();
              } catch (e: any) {
                c.setError(e.message);
              }
            }}
          >
            Discard Draft
          </Button>
          <Button
            secondary
            onClick={() => {
              setRecovery(null);
              localStorage.removeItem(storageKey);
            }}
          >
            Start New Sale
          </Button>
        </section>
      )}
      <details className="card">
        <summary>Held sales & saved drafts ({held.length})</summary>
        <Table
          rows={held}
          columns={[
            { label: "Draft", render: (r) => "D-" + r.number },
            {
              label: "Customer / cashier",
              render: (r) => r.customerName + " · " + r.cashierName,
            },
            { label: "Items", render: (r) => r.itemCount },
            {
              label: "Total before tax",
              render: (r) =>
                pk(
                  (r.data.lines || []).reduce(
                    (s: number, l: Row) =>
                      s +
                      Number(l.expectedPrice || 0) * l.quantity -
                      Number(l.discount || 0),
                    0,
                  ) - Number(r.data.discount || 0),
                ),
            },
            {
              label: "Created / Updated",
              render: (r) => fmt(r.createdAt) + " / " + fmt(r.updatedAt),
            },
            {
              label: "Actions",
              render: (r) => (
                <>
                  <button
                    disabled={cart.length > 0}
                    onClick={() => restore(r.id)}
                  >
                    Resume Sale
                  </button>
                  <button
                    onClick={() =>
                      c
                        .run(() =>
                          api("/pos-drafts/" + r.id + "/discard", {
                            version: r.version,
                          }),
                        )
                        .catch(() => {})
                    }
                  >
                    Discard
                  </button>
                </>
              ),
            },
          ]}
        />
      </details>
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
                <div
                  className={
                    "cart-line " +
                    (issues.some((x) => x.index === i) ? "error" : "")
                  }
                  key={i}
                >
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
                    {l.medicine.strength} · {pk(price(l))} /{" "}
                    {unitsFor(l.medicine).find((u) => u.value === l.unit)
                      ?.label || l.unit}
                  </small>
                  {issues
                    .filter((x) => x.index === i)
                    .map((x, n) => (
                      <p role="alert" key={n}>
                        {x.message}
                        {x.code === "PRICE" && (
                          <button
                            onClick={() => {
                              setCart(
                                cart.map((v, j) =>
                                  j === i
                                    ? {
                                        ...v,
                                        expectedPrice: x.currentPrice,
                                        acceptPriceChange: true,
                                      }
                                    : v,
                                ),
                              );
                              changed();
                            }}
                          >
                            Accept current price
                          </button>
                        )}
                      </p>
                    ))}
                  {l.medicine.mrp &&
                  price(l) > Number(l.medicine.mrp) * factor(l) ? (
                    <p className="notice">
                      {l.medicine.name}: Selling price {pk(price(l))} exceeds
                      MRP {pk(Number(l.medicine.mrp) * factor(l))}. Review
                      applicable price rules.
                    </p>
                  ) : null}
                  {l.medicine.serialTracked && (
                    <Field
                      label={
                        "Serial numbers for " +
                        l.medicine.name +
                        " (comma separated)"
                      }
                      value={(l.serialNumbers || []).join(", ")}
                      set={(v: string) => {
                        setCart(
                          cart.map((x, n) =>
                            n === i
                              ? {
                                  ...x,
                                  serialNumbers: v
                                    .split(",")
                                    .map((x) => x.trim())
                                    .filter(Boolean),
                                }
                              : x,
                          ),
                        );
                        changed();
                      }}
                    />
                  )}
                  {c.user.role !== "CASHIER" &&
                    issues.some((x) => x.index === i) && (
                      <button onClick={() => c.setPage("Medicines")}>
                        Open Product Master to correct
                      </button>
                    )}
                  <div className="quantity-row">
                    <input
                      aria-label={"Quantity for " + l.medicine.name}
                      type="number"
                      min="0.000001"
                      step={l.medicine.fractionalAllowed ? "any" : "1"}
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
                            n === i
                              ? {
                                  ...v,
                                  unit: e.target.value,
                                  expectedPrice: unitPrice(
                                    v.medicine,
                                    e.target.value,
                                  ),
                                  acceptPriceChange: false,
                                }
                              : v,
                          ),
                        );
                        changed();
                      }}
                    >
                      {unitsFor(l.medicine).map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
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
              <small>{draftStatus}</small>
              <fieldset
                disabled={submitted || c.busy}
                style={{ border: 0, padding: 0, minWidth: 0 }}
              >
                <Field
                  label="Search customers for sale"
                  value={customerSearch}
                  set={setCustomerSearch}
                />
                <Field
                  label="Customer"
                  value={customerId}
                  set={(v: string) => {
                    setCustomerId(v);
                    changed();
                  }}
                  options={[
                    { value: "", label: "Walk-in customer" },
                    ...customers.map((r: Row) => ({
                      value: r.id,
                      label:
                        r.name +
                        " · Due " +
                        pk(r.outstanding) +
                        " · Available " +
                        (r.availableCredit === null
                          ? "unlimited"
                          : pk(r.availableCredit)),
                    })),
                  ]}
                />
                <button onClick={() => setQuickCustomer(true)}>
                  + Quick customer
                </button>
                <Field
                  label="Sale notes"
                  value={notes}
                  set={(v: string) => {
                    setNotes(v);
                    changed();
                  }}
                />
                {payments.map((p, i) => (
                  <div className="card" key={i}>
                    <PaymentFields
                      checkout
                      p={p}
                      banks={banks}
                      set={(v: Row) => {
                        setPayments(payments.map((x, n) => (n === i ? v : x)));
                        changed();
                      }}
                    />
                    <button
                      disabled={submitted}
                      onClick={() => {
                        setPayments(payments.filter((_, n) => n !== i));
                        changed();
                      }}
                    >
                      Remove payment
                    </button>
                  </div>
                ))}
                <Button
                  secondary
                  disabled={submitted}
                  onClick={() => {
                    setPayments([
                      ...payments,
                      {
                        method: "CASH",
                        amount: String(
                          Math.max(
                            0,
                            total -
                              payments.reduce(
                                (s, p) => s + Number(p.amount),
                                0,
                              ),
                          ),
                        ),
                        reference: "",
                        paymentDate: day(),
                        cardLastFour: "",
                        terminal: "",
                        remarks: "",
                      },
                    ]);
                    changed();
                  }}
                >
                  Add split payment
                </Button>
                {payments.length > 0 && (
                  <p>
                    Allocated{" "}
                    {pk(payments.reduce((s, p) => s + Number(p.amount), 0))} /{" "}
                    {pk(total)}. Edit amounts to match the total.
                  </p>
                )}
              </fieldset>
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
              {!payments.length && (
                <Field
                  label="Payment method"
                  value={payment}
                  disabled={submitted}
                  set={(v: any) => {
                    setPayment(v);
                    changed();
                  }}
                  options={[
                    "CASH",
                    "CARD",
                    "CREDIT",
                    "ADVANCE",
                    "RAAST",
                    "OTHER",
                  ]}
                />
              )}
              {!payments.length && payment === "CASH" && (
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
              <Button
                secondary
                disabled={c.busy || !cart.length || submitted}
                onClick={() =>
                  saveNow("HELD")
                    .then(() => clearSale())
                    .catch((e: any) => c.setError(e.message))
                }
              >
                Hold Sale / Start New Sale
              </Button>
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
                      if (!submitted) {
                        saveNow()
                          .then((d) =>
                            api("/pos-drafts/" + d.id + "/discard", {
                              version: d.version,
                            }),
                          )
                          .then(clearSale)
                          .catch((e: any) => c.setError(e.message));
                      }
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
      {quickCustomer && (
        <CustomerForm
          c={c}
          customer={{}}
          close={() => setQuickCustomer(false)}
          onSaved={(r: Row) => setCustomerId(r.id)}
        />
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
                {
                  label: "Quantity",
                  render: (r) => r.quantity + " " + (r.unitLabel || r.unit),
                },
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
            {["58", "80", "A4"].map((f) => (
              <a
                key={f}
                className="button secondary"
                target="_blank"
                rel="noreferrer"
                href={"/api/sales/" + receipt.id + "/receipt?format=" + f}
              >
                {f === "A4" ? "A4 Invoice" : f + "mm Receipt"}
              </a>
            ))}
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
