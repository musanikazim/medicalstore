import MasterData from "../components/master-data";
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
export default function StoreSettings(c: any) {
  const [tab, setTab] = useState("Store profile"),
    [form, setFormValue] = useState<Row>(c.settings),
    [newUser, setNewUser] = useState<Row | null>(null);
  const dirty = useRef(false);
  const setForm = (next: Row) => {
    dirty.current = true;
    setFormValue(next);
  };
  const users =
    useData(
      c.user.role === "ADMIN" ? "/users" : "/settings",
      c.version,
      c.setError,
    ) || [];
  const audits =
    useData(
      c.user.role === "ADMIN" ? "/audit" : "/settings",
      c.version,
      c.setError,
    ) || [];
  useEffect(() => {
    if (!dirty.current) setFormValue(c.settings);
  }, [c.settings]);
  if (c.user.role !== "ADMIN")
    return (
      <section className="card">
        <Empty text="Store settings are managed by your administrator." />
      </section>
    );
  if (!c.settingsLoaded)
    return <div className="loading">Loading store settings…</div>;
  return (
    <>
      <div className="tab-bar">
        {[
          "Store profile",
          "Master Data Management",
          "Invoice & Printing",
          "Bank accounts",
          "Users & access",
          "Audit log",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Master Data Management" ? (
        <MasterData {...c} />
      ) : tab === "Bank accounts" ? (
        <Banks {...c} />
      ) : tab === "Store profile" || tab === "Invoice & Printing" ? (
        <section className="card settings-card">
          <div className="card-title">
            <div>
              <h2>Store & counter preferences</h2>
              <p>These details appear on your receipts.</p>
            </div>
            <Settings size={21} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(async () => {
                const saved = await api("/settings", form, "PUT");
                dirty.current = false;
                setFormValue(saved);
                c.onSettingsSaved(saved);
                return saved;
              }, "Store settings updated").catch(() => {});
            }}
          >
            <label className="field">
              <span>Store logo (PNG/JPEG, up to 200 KB)</span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 200000) {
                    c.setError("Logo must be 200 KB or smaller");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () =>
                    setForm({ ...form, logo: String(reader.result) });
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {form.logo && (
              <div className="logo-preview">
                <img src={form.logo} alt="Store logo" width={70} />
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setForm({ ...form, logo: "" })}
                >
                  Remove logo
                </button>
              </div>
            )}
            <h3>Invoice & Printing</h3>
            <div className="form-grid">
              <Field
                label="Default print format"
                value={form.printFormat || form.receiptWidth || "80"}
                options={[
                  { value: "58", label: "58mm Thermal" },
                  { value: "80", label: "80mm Thermal" },
                  { value: "A4", label: "A4 Invoice" },
                ]}
                set={(v: string) => setForm({ ...form, printFormat: v })}
              />
              <Field
                label="Tax percent"
                type="number"
                value={form.taxRate || 0}
                set={(v: number) => setForm({ ...form, taxRate: v })}
              />
              <Field
                label="Return policy"
                value={form.returnPolicy || ""}
                set={(v: string) => setForm({ ...form, returnPolicy: v })}
              />
              <Field
                label="Store notes"
                value={form.storeNotes || ""}
                set={(v: string) => setForm({ ...form, storeNotes: v })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={!!form.showBatch}
                  onChange={(e) =>
                    setForm({ ...form, showBatch: e.target.checked })
                  }
                />
                Print batch allocations
              </label>
            </div>
            <div className="form-grid">
              {[
                ["storeName", "Store name"],
                ["address", "Address"],
                ["phone", "Contact number"],
                ["licence", "Drug sale licence"],
                ["footer", "Receipt footer"],
                ["invoicePrefix", "Invoice prefix"],
              ].map(([k, l]) => (
                <Field
                  key={k}
                  label={l}
                  value={form[k]}
                  set={(v: any) => setForm({ ...form, [k]: v })}
                  required={k === "storeName"}
                />
              ))}
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.allowLooseSales !== false}
                  onChange={(e) =>
                    setForm({ ...form, allowLooseSales: e.target.checked })
                  }
                />
                Allow loose unit sales (medicine restrictions still apply)
              </label>
              <Field
                label="Thermal receipt width"
                value={form.receiptWidth}
                set={(v: any) => setForm({ ...form, receiptWidth: v })}
                options={["58", "80"]}
              />
              <Field
                label="Expiry Warning Days"
                type="number"
                min="0"
                step="1"
                required
                value={form.expiryDays}
                set={(v: any) => setForm({ ...form, expiryDays: v })}
              />
              <Field
                label="Default payment"
                value={form.defaultPayment}
                set={(v: any) => setForm({ ...form, defaultPayment: v })}
                options={["CASH", "CARD", "RAAST", "OTHER"]}
              />
            </div>
            <div className="settings-rules">
              <ShieldCheck size={22} />
              <p>
                PKR · Asia/Karachi · DD/MM/YYYY
                <br />
                Negative stock prevention and FEFO are always enforced.
              </p>
            </div>
            <Button disabled={c.busy}>Save settings</Button>
          </form>
        </section>
      ) : tab === "Users & access" ? (
        <section className="card">
          <div className="card-title">
            <h2>Team access</h2>
            <Button
              onClick={() =>
                setNewUser({
                  name: "",
                  email: "",
                  password: "",
                  role: "CASHIER",
                })
              }
            >
              <Plus size={17} />
              Add user
            </Button>
          </div>
          <Table
            rows={Array.isArray(users) ? users : []}
            columns={[
              { label: "Name", render: (r) => <b>{r.name}</b> },
              { label: "Email", render: (r) => r.email },
              { label: "Role", render: (r) => <Badge>{r.role}</Badge> },
              {
                label: "Status",
                render: (r) => (
                  <Badge tone={r.active ? "green" : "red"}>
                    {r.active ? "Active" : "Inactive"}
                  </Badge>
                ),
              },
              {
                label: "",
                render: (r) => (
                  <button
                    className="text-link"
                    onClick={() => setNewUser({ ...r, password: "" })}
                  >
                    Edit access
                  </button>
                ),
              },
            ]}
          />
        </section>
      ) : (
        <section className="card">
          <div className="card-title">
            <h2>Audit trail</h2>
            <Badge>Latest 500 events</Badge>
          </div>
          <Table
            rows={Array.isArray(audits) ? audits : []}
            columns={[
              {
                label: "Date",
                render: (r) =>
                  new Date(r.createdAt).toLocaleString("en-GB", {
                    timeZone: "Asia/Karachi",
                  }),
              },
              { label: "Action", render: (r) => <Badge>{r.action}</Badge> },
              { label: "User", render: (r) => <code>{r.userId}</code> },
              { label: "Entity", render: (r) => <code>{r.entity}</code> },
            ]}
          />
        </section>
      )}
      {newUser && (
        <Modal
          title={newUser.id ? "Edit team access" : "Add team member"}
          close={() => setNewUser(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const { id, name, email, password, role, active } = newUser;
              c.run(() =>
                api(
                  "/users" + (id ? "/" + id : ""),
                  id
                    ? { role, active, ...(password ? { password } : {}) }
                    : { name, email, password, role },
                  id ? "PUT" : "POST",
                ),
              )
                .then(() => setNewUser(null))
                .catch(() => {});
            }}
          >
            {!newUser.id &&
              ["name", "email"].map((k) => (
                <Field
                  key={k}
                  label={k}
                  type={k === "email" ? "email" : "text"}
                  value={newUser[k]}
                  set={(v: any) => setNewUser({ ...newUser, [k]: v })}
                  required
                />
              ))}
            <Field
              label={
                newUser.id
                  ? "New password (leave blank to keep)"
                  : "Password (12+ characters)"
              }
              type="password"
              value={newUser.password}
              set={(v: any) => setNewUser({ ...newUser, password: v })}
              minLength={12}
              required={!newUser.id}
            />
            <Field
              label="Role"
              value={newUser.role}
              set={(v: any) => setNewUser({ ...newUser, role: v })}
              options={["ADMIN", "MANAGER", "CASHIER"]}
            />
            {newUser.id && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={newUser.active}
                  onChange={(e) =>
                    setNewUser({ ...newUser, active: e.target.checked })
                  }
                />
                Active account
              </label>
            )}
            <div className="modal-actions">
              <Button disabled={c.busy}>Save access</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function Banks(c: any) {
  const rows = useData("/bank-accounts?all=true", c.version, c.setError) || [];
  const [edit, set] = useState<Row | null>(null);
  return (
    <section className="card settings-card">
      <h2>Bank accounts</h2>
      <Button
        onClick={() =>
          set({
            name: "",
            bankName: "",
            accountTitle: "",
            accountNumber: "",
            active: true,
          })
        }
      >
        Add bank account
      </Button>
      <Table
        rows={rows}
        onRow={set}
        columns={["name", "bankName", "accountTitle", "accountNumber"].map(
          (k) => ({ label: k, render: (r) => r[k] }),
        )}
      />
      {edit && (
        <Modal title="Bank account" close={() => set(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(() =>
                api(
                  "/bank-accounts" + (edit.id ? "/" + edit.id : ""),
                  edit,
                  edit.id ? "PUT" : "POST",
                ),
              )
                .then(() => set(null))
                .catch(() => {});
            }}
          >
            {["name", "bankName", "accountTitle", "accountNumber"].map((k) => (
              <Field
                key={k}
                label={k}
                value={edit[k]}
                set={(v: string) => set({ ...edit, [k]: v })}
              />
            ))}
            <label>
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => set({ ...edit, active: e.target.checked })}
              />
              Active
            </label>
            <Button>Save</Button>
          </form>
        </Modal>
      )}
    </section>
  );
}
