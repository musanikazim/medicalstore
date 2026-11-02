import { unitsFor, unitFactor } from "../product-utils";
import { ExpiryField, ExpiryWarning, entryBlocked } from "../components/expiry";
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
const freshPurchase = () => ({
  supplierId: "",
  supplierInvoice: "",
  invoiceDate: day(),
  receivingDate: day(),
  remarks: "",
  charges: 0,
  discount: 0,
  lines: [] as Row[],
});
export default function Purchases(c: any) {
  const list = useData("/purchases", c.version, c.setError) || [],
    suppliers = useData("/suppliers", c.version, c.setError) || [];
  const [edit, setEdit] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [supplierForm, setSupplierForm] = useState<Row | null>(null),
    [q, setQ] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [postAcknowledgements, setPostAcknowledgements] = useState<
    Record<string, boolean>
  >({});
  const [postKeys] = useState(() => new Map<string, string>());
  const set = (k: string, v: any) => setEdit((p) => ({ ...p, [k]: v }));
  const setLine = (i: number, k: string, v: any) =>
    setEdit((p) => ({
      ...p,
      lines: p!.lines.map((l: Row, n: number) =>
        n === i
          ? {
              ...l,
              [k]: v,
              ...(["medicineId", "batchNumber", "expiry"].includes(k)
                ? { ignoreExpiryWarning: false }
                : {}),
            }
          : l,
      ),
    }));
  return (
    <>
      <div className="mini-stats">
        <div>
          <small>Total invoices</small>
          <strong>{list.length}</strong>
        </div>
        <div>
          <small>Awaiting posting</small>
          <strong>
            {list.filter((p: Row) => p.status === "DRAFT").length}
          </strong>
        </div>
        <div>
          <small>Posted purchases</small>
          <strong>
            {pk(
              list
                .filter((p: Row) => p.status === "POSTED")
                .reduce((s: number, p: Row) => s + Number(p.total), 0),
            )}
          </strong>
        </div>
      </div>
      <section className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={18} />
            <input
              aria-label="Search purchases"
              placeholder="Supplier or invoice number"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Field
            label="Purchases from"
            type="date"
            value={from}
            set={setFrom}
          />
          <Field label="Purchases to" type="date" value={to} set={setTo} />
          <Button
            secondary
            onClick={() =>
              setSupplierForm({ name: "", phone: "", address: "" })
            }
          >
            <Plus size={17} />
            Supplier
          </Button>
          <Button onClick={() => setEdit(freshPurchase())}>
            <Plus size={17} />
            New purchase
          </Button>
        </div>
        <Table
          rows={list.filter(
            (p: Row) =>
              (!from || p.invoiceDate >= from) &&
              (!to || p.invoiceDate <= to) &&
              (p.supplier.name + " " + p.supplierInvoice)
                .toLowerCase()
                .includes(q.toLowerCase()),
          )}
          onRow={setDetail}
          columns={[
            {
              label: "Invoice",
              render: (r) => <b>PUR-{r.number.toString().padStart(5, "0")}</b>,
            },
            {
              label: "Supplier",
              render: (r) => (
                <div>
                  <b>{r.supplier.name}</b>
                  <small>{r.supplierInvoice}</small>
                </div>
              ),
            },
            { label: "Invoice date", render: (r) => fmt(r.invoiceDate) },
            { label: "Items", render: (r) => r.lines.length },
            { label: "Amount", render: (r) => <b>{pk(r.total)}</b> },
            {
              label: "Status",
              render: (r) => (
                <Badge tone={r.status === "POSTED" ? "green" : "amber"}>
                  {r.status}
                </Badge>
              ),
            },
            {
              label: "",
              render: (r) =>
                r.status === "DRAFT" ? (
                  <button
                    className="text-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEdit({ ...r });
                    }}
                  >
                    Edit draft
                  </button>
                ) : (
                  <ChevronRight size={16} />
                ),
            },
          ]}
        />
      </section>
      {supplierForm && (
        <Modal
          title={supplierForm.id ? "Edit supplier" : "Add supplier"}
          close={() => setSupplierForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(() =>
                api(
                  "/suppliers" + (supplierForm.id ? "/" + supplierForm.id : ""),
                  supplierForm,
                  supplierForm.id ? "PUT" : "POST",
                ),
              )
                .then(() => setSupplierForm(null))
                .catch(() => {});
            }}
          >
            <Field
              label="Existing supplier"
              value={supplierForm.id || ""}
              set={(v: any) =>
                setSupplierForm(
                  suppliers.find((s: Row) => s.id === v) || {
                    name: "",
                    phone: "",
                    address: "",
                  },
                )
              }
              options={[
                { value: "", label: "Create new supplier" },
                ...suppliers.map((s: Row) => ({ value: s.id, label: s.name })),
              ]}
            />
            {["name", "phone", "address"].map((k) => (
              <Field
                key={k}
                label={k}
                value={supplierForm[k]}
                set={(v: any) => setSupplierForm({ ...supplierForm, [k]: v })}
                required={k === "name"}
              />
            ))}
            <div className="modal-actions">
              <Button disabled={c.busy}>Save supplier</Button>
            </div>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Edit purchase draft" : "New purchase invoice"}
          close={() => setEdit(null)}
          wide
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(
                () =>
                  api(
                    "/purchases" + (edit.id ? "/" + edit.id : ""),
                    edit,
                    edit.id ? "PUT" : "POST",
                  ),
                "Draft saved. Post it to add stock.",
              )
                .then(() => setEdit(null))
                .catch(() => {});
            }}
          >
            <div className="form-grid">
              <Field
                label="Supplier"
                value={edit.supplierId}
                set={(v: any) => set("supplierId", v)}
                options={[
                  { value: "", label: "Select supplier" },
                  ...suppliers.map((s: Row) => ({
                    value: s.id,
                    label: s.name,
                  })),
                ]}
                required
              />
              <Field
                label="Supplier invoice number"
                value={edit.supplierInvoice}
                set={(v: any) => set("supplierInvoice", v)}
                required
              />
              <Field
                label="Invoice date"
                type="date"
                value={edit.invoiceDate}
                set={(v: any) => set("invoiceDate", v)}
                required
              />
              <Field
                label="Receiving date"
                type="date"
                value={edit.receivingDate}
                set={(v: any) => set("receivingDate", v)}
                required
              />
            </div>
            <div className="purchase-lines">
              {edit.lines.map((l: Row, i: number) => (
                <div className="purchase-line" key={i}>
                  <div className="line-heading">
                    <b>Medicine {i + 1}</b>
                    <button
                      type="button"
                      aria-label="Remove purchase line"
                      onClick={() =>
                        set(
                          "lines",
                          edit.lines.filter((_: any, n: number) => n !== i),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field
                      label="Medicine"
                      value={l.medicineId}
                      set={(v: any) => {
                        const m = c.medicines.find((m: Row) => m.id === v);
                        setEdit((p) => ({
                          ...p,
                          lines: p!.lines.map((line: Row, n: number) =>
                            n === i
                              ? {
                                  ...line,
                                  medicineId: v,
                                  ignoreExpiryWarning: false,
                                  unit: m?.purchaseUnit || "box",
                                  unitCost: new Decimal(m?.purchasePrice || 0)
                                    .mul(m ? unitFactor(m, m.purchaseUnit) : 1)
                                    .toString(),
                                  sellingPrice: m?.salePrice || 0,
                                  mrp: m?.mrp ?? null,
                                  serialNumbers: [],
                                }
                              : line,
                          ),
                        }));
                      }}
                      options={[
                        { value: "", label: "Select medicine" },
                        ...c.medicines.map((m: Row) => ({
                          value: m.id,
                          label: m.name + " " + m.strength,
                        })),
                      ]}
                      required
                    />
                    {[["batchNumber", "Batch", "text"]].map(
                      ([k, label, type]) => (
                        <Field
                          key={k}
                          label={label}
                          type={type}
                          value={l[k]}
                          set={(v: any) => setLine(i, k, v)}
                          required={
                            c.medicines.find((m: Row) => m.id === l.medicineId)
                              ?.batchTracked !== false
                          }
                        />
                      ),
                    )}
                    {c.medicines.find((m: Row) => m.id === l.medicineId)
                      ?.expiryTracked !== false && (
                      <ExpiryField
                        value={l.expiry}
                        set={(v: string) => setLine(i, "expiry", v)}
                        settings={c.settings}
                        date={c.businessDate || day()}
                        checked={l.ignoreExpiryWarning}
                        onCheck={(v: boolean) =>
                          setLine(i, "ignoreExpiryWarning", v)
                        }
                      />
                    )}
                    <Field
                      label="Unit"
                      value={l.unit}
                      set={(v: any) => setLine(i, "unit", v)}
                      options={unitsFor(
                        c.medicines.find((m: Row) => m.id === l.medicineId) || {
                          baseUnit: "unit",
                          looseAllowed: true,
                          unitsPerStrip: 1,
                          stripsPerBox: 1,
                        },
                      )}
                    />
                    {[
                      ["quantity", "Paid quantity"],
                      ["bonus", "Bonus quantity (same unit)"],
                      ["unitCost", "Cost per selected unit"],
                      ["discount", "Line discount PKR"],
                      ["sellingPrice", "Sale price / base unit"],
                      ["mrp", "MRP / base unit (optional)"],
                    ].map(([k, label]) => (
                      <Field
                        key={k}
                        label={label}
                        type="number"
                        min="0"
                        value={l[k]}
                        set={(v: any) =>
                          setLine(i, k, k === "mrp" && v === "" ? null : v)
                        }
                        required={k !== "mrp"}
                      />
                    ))}
                    <Field
                      label="Serial numbers (comma separated, one per base unit including bonus)"
                      value={(l.serialNumbers || []).join(", ")}
                      set={(v: string) =>
                        setLine(
                          i,
                          "serialNumbers",
                          v
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                    {l.mrp && Number(l.sellingPrice) > Number(l.mrp) ? (
                      <p className="notice">
                        {
                          c.medicines.find((m: Row) => m.id === l.medicineId)
                            ?.name
                        }
                        : Selling price {pk(l.sellingPrice)} exceeds MRP{" "}
                        {pk(l.mrp)}. Review applicable price rules.
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              secondary
              onClick={() =>
                set("lines", [
                  ...edit.lines,
                  {
                    medicineId: "",
                    batchNumber: "",
                    expiry: "",
                    unit: "box",
                    quantity: 1,
                    bonus: 0,
                    unitCost: 0,
                    discount: 0,
                    sellingPrice: 0,
                  },
                ])
              }
            >
              <Plus size={16} />
              Add invoice line
            </Button>
            <div className="form-grid invoice-end">
              <Field
                label="Charges PKR"
                type="number"
                min="0"
                value={edit.charges}
                set={(v: any) => set("charges", v)}
              />
              <Field
                label="Invoice discount PKR"
                type="number"
                min="0"
                value={edit.discount}
                set={(v: any) => set("discount", v)}
              />
              <Field
                label="Remarks"
                value={edit.remarks}
                set={(v: any) => set("remarks", v)}
              />
            </div>
            <div className="modal-actions">
              <span>Drafts do not change stock.</span>
              <Button disabled={c.busy || !edit.lines.length}>
                Save draft
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          title={"Purchase PUR-" + detail.number}
          close={() => setDetail(null)}
          wide
        >
          <div className="print-area">
            <div className="detail-grid">
              <div>
                <small>Supplier</small>
                <strong>{detail.supplier.name}</strong>
              </div>
              <div>
                <small>Reference</small>
                <strong>{detail.supplierInvoice}</strong>
              </div>
              <div>
                <small>Status</small>
                <Badge tone={detail.status === "POSTED" ? "green" : "amber"}>
                  {detail.status}
                </Badge>
              </div>
            </div>
            <Table
              rows={detail.lines}
              columns={[
                { label: "Medicine", render: (r) => r.medicine.name },
                {
                  label: "Batch / expiry",
                  render: (r) => (
                    <>
                      {r.batchNumber}
                      <small>{fmt(r.expiry)}</small>
                      {detail.status === "DRAFT" && (
                        <ExpiryWarning
                          expiry={r.expiry}
                          settings={c.settings}
                          date={c.businessDate || day()}
                          checked={
                            postAcknowledgements[r.id] ?? r.ignoreExpiryWarning
                          }
                          onCheck={(v: boolean) =>
                            setPostAcknowledgements((p) => ({
                              ...p,
                              [r.id]: v,
                            }))
                          }
                        />
                      )}
                    </>
                  ),
                },
                {
                  label: "Received",
                  render: (r) =>
                    `${r.quantity} + ${r.bonus} ${r.unitLabel || r.unit}`,
                },
                { label: "Unit cost", render: (r) => pk(r.unitCost) },
                { label: "Net", render: (r) => pk(r.net) },
              ]}
            />
            <div className="total-line">
              Invoice total <strong>{pk(detail.total)}</strong>
            </div>
          </div>
          <div className="modal-actions">
            <a
              className="button secondary"
              href={"/api/purchases/" + detail.id + "/attachment"}
              target="_blank"
              rel="noreferrer"
            >
              Download attachment
            </a>
            <Button secondary onClick={() => window.print()}>
              <Printer size={16} />
              Print / PDF
            </Button>
            {detail.status === "DRAFT" && (
              <label className="button secondary">
                Attach invoice
                <input
                  type="file"
                  hidden
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1048576) {
                      c.setError("Attachment must be 1 MB or smaller");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () =>
                      c
                        .run(
                          () =>
                            api("/purchases/" + detail.id + "/attachment", {
                              filename: file.name,
                              mime: file.type,
                              data: String(reader.result).split(",")[1],
                            }),
                          "Invoice attachment saved",
                        )
                        .catch(() => {});
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            )}
            {detail.status === "DRAFT" && (
              <Button
                disabled={
                  c.busy ||
                  detail.lines.some((l: Row) =>
                    entryBlocked(
                      {
                        ...l,
                        ignoreExpiryWarning:
                          postAcknowledgements[l.id] ?? l.ignoreExpiryWarning,
                      },
                      c.settings,
                      c.businessDate || day(),
                    ),
                  )
                }
                onClick={() => {
                  if (!postKeys.has(detail.id))
                    postKeys.set(detail.id, crypto.randomUUID());
                  c.run(
                    () =>
                      api("/purchases/" + detail.id + "/post", {
                        key: postKeys.get(detail.id),
                        expiryOverrides: detail.lines
                          .filter(
                            (l: Row) =>
                              postAcknowledgements[l.id] ??
                              l.ignoreExpiryWarning,
                          )
                          .map((l: Row) => ({
                            lineId: l.id,
                            medicineId: l.medicineId,
                            batchNumber: l.batchNumber,
                            expiry: l.expiry,
                          })),
                      }),
                    "Purchase posted. Stock updated.",
                  )
                    .then(() => setDetail(null))
                    .catch(() => {});
                }}
              >
                <Check size={17} />
                Confirm & post purchase
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
