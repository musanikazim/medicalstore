import React, { useState } from "react";
import { Field, Table, useData } from "../shared";
import { Button } from "../components/ui/button";
import { PrintLink } from "../components/business";
export default function Reorder(c: any) {
  const [category, setCategory] = useState(""),
    [supplierId, setSupplier] = useState(""),
    [status, setStatus] = useState(""),
    [selected, setSelected] = useState<Record<string, any>>({}),
    [paper, setPaper] = useState("A4");
  const query = new URLSearchParams({ category, supplierId, status });
  const rows = useData("/reorder?" + query, c.version, c.setError) || [],
    suppliers = useData("/suppliers", c.version, c.setError) || [];
  const change = (m: any, k: string, v: any) =>
    setSelected({
      ...selected,
      [m.id]: {
        id: m.id,
        unit: "base",
        quantity: m.required,
        supplierId: m.suppliers[0]?.id || "",
        ...selected[m.id],
        [k]: v,
      },
    });
  return (
    <section className="card">
      <h2>Stock Reorder Report</h2>
      <p>
        Quantities use base units until another packaging unit is selected.
        Target stock is the greater of target, minimum and reorder level.
        Unavailable and expired batches are excluded. Edit stock levels in
        Medicine Management.
      </p>
      <div className="toolbar">
        <Field
          label="Category"
          value={category}
          set={setCategory}
          options={[
            { value: "", label: "All categories" },
            ...Array.from(new Set(c.medicines.map((m: any) => m.category))).map(
              (v: any) => ({ value: v, label: v }),
            ),
          ]}
        />
        <Field
          label="Supplier"
          value={supplierId}
          set={setSupplier}
          options={[
            { value: "", label: "All suppliers" },
            ...suppliers.map((s: any) => ({ value: s.id, label: s.name })),
          ]}
        />
        <Field
          label="Stock status"
          value={status}
          set={setStatus}
          options={[
            { value: "", label: "All requiring reorder" },
            "Out of stock",
            "Low stock",
            "Reorder",
          ]}
        />
        <PrintLink
          path={"/business-reports/reorder?" + query}
          defaultPaper={c.settings.printFormat}
        />
      </div>
      <Table
        rows={rows}
        columns={[
          {
            label: "Select",
            render: (m) => (
              <input
                type="checkbox"
                checked={!!selected[m.id]}
                onChange={(e) => {
                  if (e.target.checked) change(m, "quantity", m.required);
                  else {
                    const n = { ...selected };
                    delete n[m.id];
                    setSelected(n);
                  }
                }}
              />
            ),
          },
          { label: "Medicine", render: (m) => m.name },
          {
            label: "Sellable / minimum / reorder / target",
            render: (m) =>
              `${m.available} / ${m.minimum} / ${m.reorderLevel} / ${m.target} ${m.baseUnit}`,
          },
          { label: "Status", render: (m) => m.status },
          {
            label: "Required quantity",
            render: (m) => (
              <input
                type="number"
                min="0"
                step="0.000001"
                value={selected[m.id]?.quantity ?? m.required}
                onChange={(e) => change(m, "quantity", e.target.value)}
              />
            ),
          },
          {
            label: "Unit",
            render: (m) => (
              <select
                value={selected[m.id]?.unit || "base"}
                onChange={(e) => {
                  const u = m.units.find((u: any) => u.id === e.target.value);
                  change(m, "unit", u.id);
                  setSelected((prev) => ({
                    ...prev,
                    [m.id]: {
                      ...prev[m.id],
                      unit: u.id,
                      quantity: Math.ceil(m.required / u.factor),
                    },
                  }));
                }}
              >
                {m.units.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.factor} base)
                  </option>
                ))}
              </select>
            ),
          },
          {
            label: "Preferred supplier",
            render: (m) => (
              <select
                value={selected[m.id]?.supplierId || ""}
                onChange={(e) => change(m, "supplierId", e.target.value)}
              >
                <option value="">Unassigned</option>
                {suppliers
                  .filter((s: any) => s.active)
                  .map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            ),
          },
        ]}
      />
      <h3>Supplier purchase requirement list</h3>
      <p>This planning list does not change inventory or create a purchase.</p>
      <Field
        label="Requirement paper"
        value={paper}
        set={setPaper}
        options={["A4", "80", "58"]}
      />
      <Button
        disabled={!Object.keys(selected).length}
        onClick={async () => {
          try {
            const r = await fetch("/api/requirements/print", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "MedicalStore",
              },
              body: JSON.stringify({ rows: Object.values(selected), paper }),
            });
            if (!r.ok) throw new Error((await r.json()).error);
            const url = URL.createObjectURL(await r.blob());
            window.open(url, "_blank", "noopener");
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch (e: any) {
            c.setError(e.message);
          }
        }}
      >
        Preview requirement list / PDF
      </Button>
    </section>
  );
}
