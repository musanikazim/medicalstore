import React, { useState } from "react";
import { api, Field, Modal, Table, useData, Row } from "../shared";
import { Button } from "./ui/button";
export function MasterSelect({
  kind,
  label,
  value,
  set,
  c,
  inline = false,
}: any) {
  const rows =
    useData("/master-data?kind=" + kind, c.version, c.setError) || [];
  const [query, search] = useState(""),
    [name, newName] = useState<string | null>(null),
    [added, setAdded] = useState<Row[]>([]);
  const choices = [
    ...rows,
    ...added.filter((a) => !rows.some((r: Row) => r.id === a.id)),
  ];
  return (
    <div>
      <Field label={"Search " + label} value={query} set={search} />
      <Field
        label={label}
        value={value || ""}
        set={set}
        options={[
          { value: "", label: "Select " + label },
          ...choices
            .filter(
              (r: Row) =>
                r.id === value ||
                r.name.toLowerCase().includes(query.toLowerCase()),
            )
            .map((r: Row) => ({
              value: r.id,
              label: r.name + (r.active ? "" : " (inactive)"),
            })),
        ]}
      />
      {inline && c.user.role === "ADMIN" && (
        <button type="button" className="text-link" onClick={() => newName("")}>
          + Add New {label}
        </button>
      )}
      {name !== null && (
        <Modal title={"Add " + label} close={() => newName(null)}>
          <Field label={label + " name"} value={name} set={newName} />
          <Button
            type="button"
            disabled={c.busy || !name.trim()}
            onClick={() =>
              c
                .run(() =>
                  api("/master-data", { kind, name, active: true, data: {} }),
                )
                .then((r: Row) => {
                  setAdded([...added, r]);
                  set(r.id);
                  newName(null);
                })
                .catch(() => {})
            }
          >
            Save {label}
          </Button>
        </Modal>
      )}
    </div>
  );
}
export default function MasterData(c: any) {
  const [kind, setKind] = useState("CATEGORY"),
    [query, search] = useState(""),
    [edit, setEdit] = useState<Row | null>(null);
  const rows =
    useData("/master-data?all=true&kind=" + kind, c.version, c.setError) || [];
  return (
    <section className="card settings-card">
      <h2>Master Data Management</h2>
      <div className="toolbar">
        <Field
          label="Master"
          value={kind}
          set={setKind}
          options={[
            { value: "CATEGORY", label: "Product Categories" },
            { value: "DOSAGE_FORM", label: "Dosage Forms" },
            { value: "PRODUCT_TYPE", label: "Product Types" },
            { value: "UOM", label: "Units of Measure" },
            { value: "CUSTOMER_TYPE", label: "Customer Types" },
          ]}
        />
        <Field label="Search master data" value={query} set={search} />
        <Button onClick={() => setEdit({ name: "", active: true, data: {} })}>
          Add new
        </Button>
      </div>
      <Table
        rows={rows.filter((r: Row) =>
          r.name.toLowerCase().includes(query.toLowerCase()),
        )}
        columns={[
          { label: "Name", render: (r) => r.name },
          {
            label: "Status",
            render: (r) => (r.active ? "Active" : "Inactive"),
          },
          {
            label: "Actions",
            render: (r) => (
              <>
                <button onClick={() => setEdit(r)}>Edit</button>
                <button
                  onClick={() => {
                    if (confirm("Delete unused " + r.name + "?"))
                      c.run(() =>
                        api("/master-data/" + r.id, undefined, "DELETE"),
                      ).catch(() => {});
                  }}
                >
                  Delete unused
                </button>
              </>
            ),
          },
        ]}
      />
      {edit && (
        <Modal title="Master data" close={() => setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(() =>
                api(
                  "/master-data" + (edit.id ? "/" + edit.id : ""),
                  { ...edit, kind },
                  edit.id ? "PUT" : "POST",
                ),
              )
                .then(() => setEdit(null))
                .catch(() => {});
            }}
          >
            <Field
              label="Name"
              required
              value={edit.name}
              set={(name: string) => setEdit({ ...edit, name })}
            />
            {[
              "active",
              ...(kind === "PRODUCT_TYPE"
                ? ["requiresBatch", "requiresExpiry", "pharmaceutical"]
                : []),
              ...(kind === "UOM" ? ["fractionalAllowed"] : []),
            ].map((k) => (
              <label className="checkbox" key={k}>
                <input
                  type="checkbox"
                  checked={k === "active" ? edit.active : !!edit.data?.[k]}
                  onChange={(e) =>
                    setEdit(
                      k === "active"
                        ? { ...edit, active: e.target.checked }
                        : {
                            ...edit,
                            data: { ...edit.data, [k]: e.target.checked },
                          },
                    )
                  }
                />
                {k}
              </label>
            ))}
            <Button>Save</Button>
          </form>
        </Modal>
      )}
    </section>
  );
}
