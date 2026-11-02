import { unitsFor } from "../product-utils";
import {
  ExpiryBadge,
  ExpiryField,
  ExpiryWarning,
  entryBlocked,
} from "../components/expiry";
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
} from "../shared";
import ReturnForm from "./ReturnForm";
export default function Inventory(c: any) {
  const rows = useData("/inventory", c.version, c.setError) || [],
    movements = useData("/movements", c.version, c.setError) || [];
  const [tab, setTab] = useState("Batch stock"),
    [filter, setFilter] = useState("All stock"),
    [q, setQ] = useState(""),
    [open, setOpen] = useState<Row | null>(null),
    [adjustment, setAdjustment] = useState<Row | null>(null),
    [returnBatch, setReturnBatch] = useState<Row | null>(null),
    [status, setStatus] = useState<Row | null>(null),
    [reconcile, setReconcile] = useState<Row[] | null>(null),
    [imported, setImported] = useState<Row | null>(null);
  const filtered = rows.filter((b: Row) => {
    const expiry = expiryStatus(
      b.expiry,
      expiryThreshold(c.settings),
      c.businessDate || day(),
    );
    return (
      (b.medicine.name + " " + b.number)
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (filter === "All stock" ||
        (filter === "Expired" &&
          expiry.status === "EXPIRED" &&
          b.quantity > 0) ||
        (filter === "Expiring Soon" &&
          ["SOON", "TODAY"].includes(expiry.status) &&
          b.quantity > 0) ||
        (filter === "Restricted" && b.status !== "SELLABLE") ||
        (filter === "Low stock" &&
          c.medicines.find((m: Row) => m.id === b.medicineId)?.available <=
            b.medicine.minimumStock))
    );
  });
  return (
    <>
      <div className="tab-bar">
        {["Batch stock", "Stock ledger", "Returns"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <section className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={18} />
            <input
              aria-label="Search inventory"
              placeholder="Search medicine or batch…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Field
            label="Stock filter"
            value={filter}
            set={setFilter}
            options={[
              "All stock",
              "Low stock",
              "Expiring Soon",
              "Expired",
              "Restricted",
            ]}
          />
          <Button
            secondary
            onClick={() =>
              c
                .run(() => api("/reconciliation"), "Reconciliation checked")
                .then(setReconcile)
                .catch(() => {})
            }
          >
            <RefreshCw size={16} />
            Reconcile
          </Button>
          <Button
            secondary
            onClick={() =>
              exportSheet(
                c.medicines.slice(0, 1).map((m: Row) => ({
                  medicineId: m.id,
                  batchNumber: "OPENING-1",
                  expiry: "2030-12-31",
                  openingDate: day(),
                  quantity: 100,
                  unit: "base",
                  unitCost: m.purchasePrice,
                  reference: "Opening migration",
                })),
                "opening-stock-template.xlsx",
              ).catch((e: any) => c.setError(e.message))
            }
          >
            Template
          </Button>
          <label className="button secondary">
            Import opening
            <input
              hidden
              type="file"
              accept=".csv,.xlsx"
              onChange={async (e) => {
                try {
                  const file = e.target.files?.[0];
                  if (file)
                    setImported({
                      key: crypto.randomUUID(),
                      rows: (await readSheet(file)).map((row) => ({
                        ...row,
                        ignoreExpiryWarning: false,
                      })),
                    });
                } catch (e: any) {
                  c.setError(e.message);
                }
              }}
            />
          </label>
          <Button
            onClick={() =>
              setOpen({
                key: crypto.randomUUID(),
                medicineId: "",
                batchNumber: "",
                expiry: "",
                openingDate: day(),
                quantity: 1,
                unit: "base",
                unitCost: 0,
                reference: "",
              })
            }
          >
            <Plus size={17} />
            Opening stock
          </Button>
        </div>
        {tab === "Batch stock" ? (
          <Table
            rows={filtered}
            columns={[
              {
                label: "Medicine / batch",
                render: (r) => (
                  <div>
                    <b>{r.medicine.name}</b>
                    <small>
                      {r.number} ·{" "}
                      {r.purchaseLine?.purchase.supplier.name ||
                        "Opening / return"}
                    </small>
                  </div>
                ),
              },
              {
                label: "Expiry",
                render: (r) => (
                  <>
                    <span className={r.expiry < day() ? "danger" : ""}>
                      {r.medicine.expiryTracked === false
                        ? "Not applicable"
                        : fmt(r.expiry)}
                    </span>
                    <div className="expiry-badge">
                      <ExpiryBadge
                        expiry={r.expiry}
                        settings={c.settings}
                        date={c.businessDate || day()}
                      />
                    </div>
                  </>
                ),
              },
              {
                label: "Quantity",
                render: (r) => (
                  <div>
                    <b>
                      {r.quantity} {r.medicine.baseUnit}s
                    </b>
                    <small>
                      {Math.floor(
                        r.quantity /
                          (r.medicine.unitsPerStrip * r.medicine.stripsPerBox),
                      )}{" "}
                      boxes +{" "}
                      {Math.floor(r.quantity / r.medicine.unitsPerStrip) %
                        r.medicine.stripsPerBox}{" "}
                      strips + {r.quantity % r.medicine.unitsPerStrip} units
                    </small>
                  </div>
                ),
              },
              { label: "Cost / unit", render: (r) => pk(r.cost) },
              { label: "MRP / base", render: (r) => (r.mrp ? pk(r.mrp) : "—") },
              {
                label: "Stock value",
                render: (r) => pk(Number(r.cost) * r.quantity),
              },
              {
                label: "Status",
                render: (r) => (
                  <Badge
                    tone={
                      r.status !== "SELLABLE" || r.expiry < day()
                        ? "red"
                        : "green"
                    }
                  >
                    {r.expiry < day() ? "EXPIRED" : r.status}
                  </Badge>
                ),
              },
              {
                label: "Actions",
                render: (r) => (
                  <div className="row-actions">
                    <button
                      className="text-link"
                      onClick={() => setStatus({ ...r, reason: "" })}
                    >
                      Status
                    </button>
                    {r.purchaseLineId && (
                      <button
                        className="text-link"
                        onClick={() => setReturnBatch(r)}
                      >
                        Return
                      </button>
                    )}
                    {c.user.role === "ADMIN" && (
                      <button
                        className="text-link"
                        onClick={() =>
                          setAdjustment({
                            key: crypto.randomUUID(),
                            batchId: r.id,
                            quantity: -1,
                            reason: "",
                            reference: "",
                          })
                        }
                      >
                        Adjust
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        ) : tab === "Stock ledger" ? (
          <Table
            rows={movements.filter((m: Row) =>
              m.batch.medicine.name.toLowerCase().includes(q.toLowerCase()),
            )}
            columns={[
              {
                label: "Date",
                render: (r) => fmt(r.effectiveDate || r.createdAt),
              },
              {
                label: "Medicine",
                render: (r) => (
                  <>
                    {r.batch.medicine.name}
                    <small>{r.batch.number}</small>
                  </>
                ),
              },
              { label: "Type", render: (r) => <Badge>{r.type}</Badge> },
              {
                label: "Movement",
                render: (r) => (
                  <b className={r.quantity < 0 ? "danger" : "positive"}>
                    {r.quantity > 0 ? "+" : ""}
                    {r.quantity}
                  </b>
                ),
              },
              { label: "Reference", render: (r) => <code>{r.reference}</code> },
              { label: "Reason", render: (r) => r.reason || "—" },
            ]}
          />
        ) : (
          <ReturnHistory c={c} />
        )}
      </section>
      {imported && (
        <Modal
          title="Opening stock import preview"
          close={() => setImported(null)}
          wide
        >
          <p>
            Review the base units, costs and batch expiry dates. All rows post
            together; any validation error leaves stock unchanged.
          </p>
          <Table
            rows={imported.rows}
            columns={[
              {
                label: "Medicine",
                render: (r) =>
                  c.medicines.find((m: Row) => m.id === r.medicineId)?.name ||
                  r.medicineId,
              },
              { label: "Batch", render: (r) => r.batchNumber },
              {
                label: "Expiry",
                render: (r) => (
                  <>
                    <span>{r.expiry}</span>
                    <ExpiryWarning
                      expiry={r.expiry}
                      settings={c.settings}
                      date={c.businessDate || day()}
                      checked={r.ignoreExpiryWarning}
                      status={r.status || "SELLABLE"}
                      onCheck={(v: boolean) =>
                        setImported((p) => ({
                          ...p,
                          rows: p!.rows.map((row: Row) =>
                            row === r
                              ? { ...row, ignoreExpiryWarning: v }
                              : row,
                          ),
                        }))
                      }
                    />
                  </>
                ),
              },
              { label: "Quantity", render: (r) => r.quantity + " " + r.unit },
              { label: "Unit cost", render: (r) => pk(r.unitCost) },
            ]}
          />
          <div className="modal-actions">
            <Button
              disabled={
                c.busy ||
                imported.rows.some((r: Row) =>
                  entryBlocked(r, c.settings, c.businessDate || day()),
                )
              }
              onClick={() =>
                c
                  .run(
                    () => api("/opening/import", imported),
                    "Opening stock imported",
                  )
                  .then(() => setImported(null))
                  .catch(() => {})
              }
            >
              Confirm import
            </Button>
          </div>
        </Modal>
      )}
      {reconcile && (
        <Modal title="Stock reconciliation" close={() => setReconcile(null)}>
          {reconcile.length ? (
            <pre>{JSON.stringify(reconcile, null, 2)}</pre>
          ) : (
            <div className="sale-success">
              <ShieldCheck size={36} />
              <h2>All balances match the ledger.</h2>
              <p>Every batch quantity reconciles with its posted movements.</p>
            </div>
          )}
        </Modal>
      )}
      {open && (
        <Modal title="Record opening stock" close={() => setOpen(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(() => api("/opening", open), "Opening stock recorded")
                .then(() => setOpen(null))
                .catch(() => {});
            }}
          >
            <Field
              label="Medicine"
              value={open.medicineId}
              set={(v: any) =>
                setOpen({ ...open, medicineId: v, ignoreExpiryWarning: false })
              }
              options={[
                { value: "", label: "Select medicine" },
                ...c.medicines.map((m: Row) => ({
                  value: m.id,
                  label: m.name,
                })),
              ]}
            />
            {[
              ["batchNumber", "Batch number", "text"],
              ["openingDate", "Opening stock date", "date"],
              ["quantity", "Quantity", "number"],
              ["unitCost", "Cost per selected unit", "number"],
              ["reference", "Migration reference", "text"],
            ].map(([k, l, t]) => (
              <Field
                key={k}
                label={l}
                type={t}
                value={open[k]}
                set={(v: any) =>
                  setOpen({
                    ...open,
                    [k]: v,
                    ...(k === "batchNumber"
                      ? { ignoreExpiryWarning: false }
                      : {}),
                  })
                }
                required={
                  k !== "batchNumber" ||
                  c.medicines.find((m: Row) => m.id === open.medicineId)
                    ?.batchTracked !== false
                }
              />
            ))}
            {c.medicines.find((m: Row) => m.id === open.medicineId)
              ?.expiryTracked !== false && (
              <ExpiryField
                label="Expiry"
                value={open.expiry}
                set={(v: string) =>
                  setOpen((p) => ({
                    ...p,
                    expiry: v,
                    ignoreExpiryWarning: false,
                  }))
                }
                settings={c.settings}
                date={c.businessDate || day()}
                checked={open.ignoreExpiryWarning}
                onCheck={(v: boolean) =>
                  setOpen((p) => ({ ...p, ignoreExpiryWarning: v }))
                }
                status={open.status || "SELLABLE"}
              />
            )}
            <Field
              label="Serial numbers (comma separated)"
              value={(open.serialNumbers || []).join(", ")}
              set={(v: string) =>
                setOpen({
                  ...open,
                  serialNumbers: v
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
            <Field
              label="Stock disposition"
              value={open.status || "SELLABLE"}
              set={(v: string) =>
                setOpen((p) => ({
                  ...p,
                  status: v,
                  ignoreExpiryWarning: false,
                }))
              }
              options={["SELLABLE", "QUARANTINED", "DAMAGED", "RECALLED"]}
            />
            <Field
              label="Unit"
              value={open.unit}
              set={(v: any) => setOpen({ ...open, unit: v })}
              options={unitsFor(
                c.medicines.find((m: Row) => m.id === open.medicineId) || {
                  baseUnit: "unit",
                  looseAllowed: true,
                  unitsPerStrip: 1,
                  stripsPerBox: 1,
                },
              )}
            />
            <div className="modal-actions">
              <Button
                disabled={
                  c.busy ||
                  entryBlocked(
                    {
                      ...open,
                      expiry:
                        open.expiry ||
                        (!c.medicines.find((m: Row) => m.id === open.medicineId)
                          ?.expiryTracked
                          ? "9999-12-31"
                          : ""),
                    },
                    c.settings,
                    c.businessDate || day(),
                  )
                }
              >
                Confirm opening stock
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {adjustment && (
        <Modal
          title="Administrator stock adjustment"
          close={() => setAdjustment(null)}
        >
          <p>
            Use negative quantities for damage, disposal or shortage; positive
            quantities for verified excess.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(
                () => api("/adjustments", adjustment),
                "Adjustment recorded",
              )
                .then(() => setAdjustment(null))
                .catch(() => {});
            }}
          >
            {[
              ["quantity", "Signed base-unit quantity", "number"],
              ["reason", "Reason / adjustment type", "text"],
              ["reference", "Approval reference", "text"],
            ].map(([k, l, t]) => (
              <Field
                key={k}
                label={l}
                type={t}
                value={adjustment[k]}
                set={(v: any) => setAdjustment({ ...adjustment, [k]: v })}
                required
              />
            ))}
            <Field
              label="Adjusted serial numbers (comma separated, if tracked)"
              value={(adjustment.serialNumbers || []).join(", ")}
              set={(v: string) =>
                setAdjustment({
                  ...adjustment,
                  serialNumbers: v
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
            <div className="modal-actions">
              <Button disabled={c.busy}>Approve & post adjustment</Button>
            </div>
          </form>
        </Modal>
      )}
      {status && (
        <Modal title="Update batch disposition" close={() => setStatus(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(() =>
                api(
                  "/batches/" + status.id + "/status",
                  {
                    status: status.status,
                    reason: status.reason,
                    ignoreExpiryWarning: !!status.ignoreExpiryWarning,
                  },
                  "PUT",
                ),
              )
                .then(() => setStatus(null))
                .catch(() => {});
            }}
          >
            <Field
              label="Disposition"
              value={status.status}
              set={(v: any) => setStatus({ ...status, status: v })}
              options={["SELLABLE", "QUARANTINED", "RECALLED", "DAMAGED"]}
            />
            <Field
              label="Inspection / recall reason"
              value={status.reason}
              set={(v: any) => setStatus({ ...status, reason: v })}
              required
            />
            <ExpiryWarning
              expiry={status.expiry}
              settings={c.settings}
              date={c.businessDate || day()}
              checked={status.ignoreExpiryWarning}
              status={status.status}
              onCheck={(v: boolean) =>
                setStatus((p) => ({ ...p, ignoreExpiryWarning: v }))
              }
            />
            <div className="modal-actions">
              <Button
                disabled={
                  c.busy ||
                  (status.status === "SELLABLE" &&
                    entryBlocked(status, c.settings, c.businessDate || day()))
                }
              >
                Save disposition
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {returnBatch && (
        <ReturnForm
          c={c}
          type="PURCHASE"
          original={returnBatch}
          close={() => setReturnBatch(null)}
        />
      )}
    </>
  );
}
function ReturnHistory({ c }: any) {
  const rows = useData("/returns", c.version, c.setError) || [];
  return (
    <Table
      rows={rows}
      columns={[
        { label: "Date", render: (r) => fmt(r.createdAt) },
        { label: "Type", render: (r) => <Badge>{r.type}</Badge> },
        { label: "Reference", render: (r) => r.reference },
        { label: "Quantity", render: (r) => r.quantity },
        { label: "Refund / credit", render: (r) => pk(r.amount) },
        { label: "Disposition", render: (r) => r.disposition },
        { label: "Reason", render: (r) => r.reason },
      ]}
    />
  );
}
