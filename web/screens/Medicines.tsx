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
const medicineDefault = {
  name: "",
  generic: "",
  manufacturer: "",
  category: "",
  barcode: "",
  strength: "",
  form: "Tablet",
  baseUnit: "tablet",
  purchaseUnit: "box",
  sellingUnit: "base",
  unitsPerStrip: 10,
  stripsPerBox: 10,
  looseAllowed: true,
  prescription: false,
  purchasePrice: 0,
  salePrice: 0,
  stripPrice: null,
  boxPrice: null,
  mrp: null,
  minimumStock: 10,
  reorderQuantity: 100,
  active: true,
};
export default function Medicines(c: any) {
  const [edit, setEdit] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [category, setCategory] = useState(""),
    [company, setCompany] = useState(""),
    [importRows, setImportRows] = useState<Row[] | null>(null);
  const isManager = c.user.role !== "CASHIER";
  const searched = useMedicineSearch(
    c.search,
    c.version,
    c.medicines,
    c.setError,
  );
  const list = searched.filter(
    (m: Row) =>
      (!c.search ||
        [m.name, m.generic, m.barcode].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(c.search.toLowerCase()),
        )) &&
      (!category || m.category === category) &&
      (!company || m.manufacturer === company),
  );
  const field = (key: string, label: string, type = "text") => (
    <Field
      key={key}
      label={label}
      type={type}
      value={edit?.[key]}
      set={(v: any) => setEdit((e) => ({ ...e, [key]: v }))}
      required={key === "name"}
    />
  );
  return (
    <>
      <section className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={18} />
            <input
              aria-label="Search medicines"
              placeholder="Search name, generic or barcode"
              value={c.search}
              onChange={(e) => c.setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Category filter"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {[...new Set(c.medicines.map((m: Row) => m.category))]
              .filter(Boolean)
              .map((v: any) => (
                <option key={v}>{v}</option>
              ))}
          </select>
          <select
            aria-label="Manufacturer filter"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="">All companies</option>
            {[...new Set(c.medicines.map((m: Row) => m.manufacturer))]
              .filter(Boolean)
              .map((v: any) => (
                <option key={v}>{v}</option>
              ))}
          </select>
          {isManager && (
            <>
              <Button
                secondary
                onClick={() => {
                  exportSheet(
                    c.medicines.map(
                      ({
                        id,
                        available,
                        stock,
                        createdAt,
                        updatedAt,
                        ...m
                      }: Row) => m,
                    ),
                    "medicines.xlsx",
                  ).catch((e: any) => c.setError(e.message));
                }}
              >
                <Download size={16} />
                Export
              </Button>
              <label className="button secondary">
                Import
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  hidden
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (file) setImportRows(await readSheet(file));
                    } catch (e: any) {
                      c.setError(e.message);
                    }
                  }}
                />
              </label>
              <Button
                onClick={() =>
                  setEdit({
                    ...medicineDefault,
                    minimumStock: c.settings.defaultMinimumStock ?? 10,
                  })
                }
              >
                <Plus size={17} />
                Add medicine
              </Button>
            </>
          )}
        </div>
        <Table
          rows={list}
          onRow={setDetail}
          columns={[
            {
              label: "Medicine",
              render: (r) => (
                <div className="medicine-cell">
                  <span className="pill-icon">
                    <Pill size={19} />
                  </span>
                  <div>
                    <b>
                      {r.name} <span className="muted">{r.strength}</span>
                    </b>
                    <small>
                      MED-{String(r.code).padStart(4, "0")} ·{" "}
                      {r.generic || r.form}
                    </small>
                  </div>
                </div>
              ),
            },
            { label: "Company", render: (r) => r.manufacturer || "—" },
            {
              label: "Barcode",
              render: (r) => <code>{r.barcode || "—"}</code>,
            },
            { label: "Sale / base unit", render: (r) => pk(r.salePrice) },
            {
              label: "Available",
              render: (r) => (
                <>
                  <b>{r.available}</b>{" "}
                  <span className="muted">{r.baseUnit}s</span>
                </>
              ),
            },
            {
              label: "Status",
              render: (r) => (
                <Badge
                  tone={
                    !r.active
                      ? "red"
                      : r.available <= r.minimumStock
                        ? "amber"
                        : "green"
                  }
                >
                  {!r.active
                    ? "Inactive"
                    : r.available <= r.minimumStock
                      ? "Low stock"
                      : "In stock"}
                </Badge>
              ),
            },
            {
              label: "",
              render: (r) =>
                isManager ? (
                  <button
                    aria-label={"Edit " + r.name}
                    className="text-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEdit({ ...r });
                    }}
                  >
                    Edit
                  </button>
                ) : null,
            },
          ]}
        />
      </section>
      {edit && (
        <Modal
          title={edit.id ? "Edit medicine" : "Register medicine"}
          close={() => setEdit(null)}
          wide
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(
                () =>
                  api(
                    "/medicines" + (edit.id ? "/" + edit.id : ""),
                    edit,
                    edit.id ? "PUT" : "POST",
                  ),
                "Medicine saved",
              )
                .then(() => setEdit(null))
                .catch(() => {});
            }}
          >
            <div className="form-grid">
              {[
                ["name", "Medicine name"],
                ["generic", "Generic name"],
                ["strength", "Strength"],
                ["manufacturer", "Manufacturer"],
                ["category", "Category"],
                ["barcode", "Barcode"],
                ["form", "Dosage form"],
                ["baseUnit", "Base unit"],
                ["unitsPerStrip", "Units per strip", "number"],
                ["stripsPerBox", "Strips per box", "number"],
                ["purchasePrice", "Default purchase cost / base", "number"],
                ["salePrice", "Sale price / base", "number"],
                ["stripPrice", "Strip price (optional)", "number"],
                ["boxPrice", "Box price (optional)", "number"],
                ["mrp", "MRP / base (optional)", "number"],
                ["minimumStock", "Minimum stock", "number"],
                ["reorderQuantity", "Reorder quantity", "number"],
              ].map(([k, l, t]) => field(k, l, t))}
              <Field
                label="Default purchase unit"
                value={edit.purchaseUnit}
                set={(v: any) => setEdit({ ...edit, purchaseUnit: v })}
                options={["base", "strip", "box"]}
              />
              <Field
                label="Default selling unit"
                value={edit.sellingUnit}
                set={(v: any) => setEdit({ ...edit, sellingUnit: v })}
                options={["base", "strip", "box"]}
              />
              {["active", "looseAllowed", "prescription"].map((k) => (
                <label className="checkbox" key={k}>
                  <input
                    type="checkbox"
                    checked={!!edit[k]}
                    onChange={(e) =>
                      setEdit({ ...edit, [k]: e.target.checked })
                    }
                  />
                  {
                    {
                      active: "Active medicine",
                      looseAllowed: "Allow individual unit sales",
                      prescription: "Prescription required",
                    }[k]
                  }
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <Button secondary type="button" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button disabled={c.busy}>Save medicine</Button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <MedicineDetail c={c} medicine={detail} close={() => setDetail(null)} />
      )}
      {importRows && (
        <Modal
          title="Medicine import preview"
          close={() => setImportRows(null)}
          wide
        >
          <p>
            Columns use the exported medicine field names. Review all rows
            before importing. Duplicate records are rejected.
          </p>
          <Table
            rows={importRows}
            columns={[
              { label: "Name", render: (r) => r.name },
              { label: "Generic", render: (r) => r.generic },
              { label: "Sale price", render: (r) => pk(r.salePrice) },
            ]}
          />
          <div className="modal-actions">
            <Button secondary onClick={() => setImportRows(null)}>
              Cancel
            </Button>
            <Button
              disabled={c.busy || importRows.length > 500}
              onClick={() =>
                c
                  .run(
                    () => api("/medicines/import", { rows: importRows }),
                    "Medicines imported",
                  )
                  .then(() => setImportRows(null))
                  .catch(() => {})
              }
            >
              Import {importRows.length} medicines
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function MedicineDetail({ c, medicine: m, close }: any) {
  const movements = useData(
    c.user.role === "CASHIER" ? "/settings" : "/movements?medicineId=" + m.id,
    c.version,
    c.setError,
  );
  return (
    <Modal title={m.name + " · stock history"} close={close} wide>
      <div className="detail-grid">
        <div>
          <small>Available stock</small>
          <strong>
            {m.available} {m.baseUnit}s
          </strong>
        </div>
        <div>
          <small>Packaging</small>
          <strong>
            1 box = {m.unitsPerStrip * m.stripsPerBox} {m.baseUnit}s
          </strong>
        </div>
        <div>
          <small>Selling price</small>
          <strong>{pk(m.salePrice)}</strong>
        </div>
      </div>
      {c.user.role !== "CASHIER" && (
        <Table
          rows={movements || []}
          columns={[
            { label: "Date", render: (r) => fmt(r.createdAt) },
            { label: "Batch", render: (r) => r.batch.number },
            { label: "Movement", render: (r) => <Badge>{r.type}</Badge> },
            {
              label: "Quantity",
              render: (r) => (
                <b>
                  {r.quantity > 0 ? "+" : ""}
                  {r.quantity}
                </b>
              ),
            },
            { label: "Reference", render: (r) => <code>{r.reference}</code> },
          ]}
        />
      )}
    </Modal>
  );
}
