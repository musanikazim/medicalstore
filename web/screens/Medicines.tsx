import { MasterSelect } from "../components/master-data";
import { unitsFor } from "../product-utils";
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
  const types =
    useData("/master-data?kind=PRODUCT_TYPE", c.version, c.setError) || [];
  const pharma =
    types.find((t: Row) => t.id === edit?.productTypeId)?.data
      ?.pharmaceutical ?? !edit?.productTypeId;
  const isManager = c.user.role !== "CASHIER";
  const searched = useMedicineSearch(
    c.search,
    c.version,
    c.medicines,
    c.setError,
  );
  const list = searched.filter(
    (m: Row) =>
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
              <MasterSelect
                c={c}
                kind="PRODUCT_TYPE"
                label="Product type"
                value={edit.productTypeId}
                set={(v: string) => {
                  const policy = types.find((t: Row) => t.id === v)?.data || {};
                  setEdit({
                    ...edit,
                    productTypeId: v,
                    form: policy.pharmaceutical ? "Tablet" : "",
                    dosageFormId: null,
                    batchTracked: !!policy.requiresBatch,
                    expiryTracked: !!policy.requiresExpiry,
                  });
                }}
              />
              <MasterSelect
                c={c}
                kind="CATEGORY"
                label="Category"
                inline
                value={edit.categoryId}
                set={(v: string) =>
                  setEdit((previous: Row | null) => ({
                    ...previous,
                    categoryId: v,
                  }))
                }
              />
              {pharma && (
                <MasterSelect
                  c={c}
                  kind="DOSAGE_FORM"
                  label="Dosage Form"
                  inline
                  value={edit.dosageFormId}
                  set={(v: string) =>
                    setEdit((previous: Row | null) => ({
                      ...previous,
                      dosageFormId: v,
                      form: v ? previous?.form : "",
                    }))
                  }
                />
              )}
              <MasterSelect
                c={c}
                kind="UOM"
                label="Base unit"
                value={edit.baseUnitId}
                set={(v: string) => setEdit({ ...edit, baseUnitId: v })}
              />
              <Field
                label="Barcode type"
                value={edit.barcodeType || "CODE128"}
                set={(v: string) => setEdit({ ...edit, barcodeType: v })}
                options={["CODE128", "EAN13", "EAN8", "UPC_A"]}
              />
              {[
                ["name", "Medicine name"],
                ["generic", "Generic name"],
                ["strength", "Strength"],
                ["manufacturer", "Manufacturer"],
                ["brand", "Brand"],
                ["specification", "Size / Specification"],
                ["model", "Model"],
                ["warranty", "Warranty"],
                ["barcode", "Barcode"],

                ["unitsPerStrip", "Units per strip", "number"],
                ["stripsPerBox", "Strips per box", "number"],
                ["purchasePrice", "Default purchase cost / base", "number"],
                ["salePrice", "Sale price / base", "number"],
                ["stripPrice", "Strip price (optional)", "number"],
                ["boxPrice", "Box price (optional)", "number"],
                ["mrp", "MRP / base (optional)", "number"],
                ["minimumStock", "Minimum stock", "number"],
                ["reorderQuantity", "Reorder quantity", "number"],
              ]
                .filter(([k]) =>
                  pharma
                    ? !["model", "warranty", "specification"].includes(k)
                    : !["generic", "strength"].includes(k),
                )
                .map(([k, l, t]) => field(k, l, t))}
              <Field
                label="Default purchase unit"
                value={edit.purchaseUnit}
                set={(v: any) => setEdit({ ...edit, purchaseUnit: v })}
                options={unitsFor(edit)}
              />
              <Field
                label="Default selling unit"
                value={edit.sellingUnit}
                set={(v: any) => setEdit({ ...edit, sellingUnit: v })}
                options={unitsFor(edit)}
              />
              {[
                "active",
                "looseAllowed",
                "prescription",
                "batchTracked",
                "expiryTracked",
                "serialTracked",
                "fractionalAllowed",
              ].map((k) => (
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
                      batchTracked: "Track batch / lot",
                      expiryTracked: "Track expiry (required for medicines)",
                      serialTracked: "Track serial numbers",
                      fractionalAllowed: "Allow fractional quantities",
                    }[k]
                  }
                </label>
              ))}
            </div>
            {edit.mrp !== null &&
            edit.mrp !== undefined &&
            Number(edit.salePrice) > Number(edit.mrp) ? (
              <p className="notice">
                {edit.name}: Selling price {pk(edit.salePrice)} exceeds MRP{" "}
                {pk(edit.mrp)}. Review applicable price rules; this warning is
                not legal approval.
              </p>
            ) : null}
            <h3>Additional packaging conversions</h3>
            <p>
              Enter the number of base units in one selected package. Existing
              stock conversions cannot be changed.
            </p>
            {(edit.packaging || []).map((p: Row, i: number) => (
              <div className="form-grid" key={i}>
                <MasterSelect
                  c={c}
                  kind="UOM"
                  label="Package unit"
                  value={p.unitId}
                  set={(v: string) =>
                    setEdit({
                      ...edit,
                      packaging: edit.packaging.map((x: Row, n: number) =>
                        n === i ? { ...x, unitId: v } : x,
                      ),
                    })
                  }
                />
                {["factor", "salePrice"].map((k) => (
                  <Field
                    key={k}
                    label={
                      k === "factor"
                        ? "Base units per package"
                        : "Package sale price (optional)"
                    }
                    type="number"
                    value={p[k]}
                    set={(v: any) =>
                      setEdit({
                        ...edit,
                        packaging: edit.packaging.map((x: Row, n: number) =>
                          n === i ? { ...x, [k]: v === "" ? null : v } : x,
                        ),
                      })
                    }
                  />
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={!!p.fractionalAllowed}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        packaging: edit.packaging.map((x: Row, n: number) =>
                          n === i
                            ? { ...x, fractionalAllowed: e.target.checked }
                            : x,
                        ),
                      })
                    }
                  />
                  Fractional package quantities
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setEdit({
                      ...edit,
                      packaging: edit.packaging.filter(
                        (_: any, n: number) => n !== i,
                      ),
                    })
                  }
                >
                  Remove conversion
                </button>
              </div>
            ))}
            <Button
              secondary
              type="button"
              onClick={() =>
                setEdit({
                  ...edit,
                  packaging: [
                    ...(edit.packaging || []),
                    {
                      unitId: "",
                      factor: 1,
                      salePrice: null,
                      fractionalAllowed: false,
                    },
                  ],
                })
              }
            >
              Add packaging
            </Button>
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
