import React, { useState } from "react";
import { api, Field, Modal, Table, useData, pk } from "../shared";
import { Button } from "../components/ui/button";
import { PrintLink } from "../components/business";
export default function Suppliers(c: any) {
  const [q, setQ] = useState(""),
    [edit, setEdit] = useState<any>(null),
    [id, setId] = useState("");
  const list = useData("/suppliers", c.version, c.setError) || [],
    detail = useData(
      id ? "/suppliers/" + id : "/suppliers",
      c.version,
      c.setError,
    );
  return (
    <>
      <section className="card">
        <div className="toolbar">
          <Field label="Search suppliers" value={q} set={setQ} />
          <Button
            onClick={() =>
              setEdit({
                name: "",
                phone: "",
                address: "",
                contactPerson: "",
                email: "",
                remarks: "",
                active: true,
              })
            }
          >
            New supplier
          </Button>
          <PrintLink
            path="/business-reports/suppliers"
            defaultPaper={c.settings.printFormat}
          />
        </div>
        <Table
          rows={list.filter((s: any) =>
            [s.name, s.phone, s.contactPerson]
              .join(" ")
              .toLowerCase()
              .includes(q.toLowerCase()),
          )}
          columns={[
            { label: "Supplier", render: (s) => s.name },
            { label: "Contact person", render: (s) => s.contactPerson },
            { label: "Mobile", render: (s) => s.phone },
            { label: "Address", render: (s) => s.address },
            {
              label: "Status",
              render: (s) => (s.active ? "Active" : "Inactive"),
            },
            { label: "Opening payable", render: (s) => pk(s.openingPayable) },
            {
              label: "Actions",
              render: (s) => (
                <>
                  <Button secondary onClick={() => setId(s.id)}>
                    View
                  </Button>
                  <Button secondary onClick={() => setEdit(s)}>
                    Edit
                  </Button>
                </>
              ),
            },
          ]}
        />
        <p>
          Opening payable is an imported opening record. Ongoing supplier
          payable balances are unavailable because supplier payments are not
          modeled.
        </p>
      </section>
      {id && detail?.purchases && (
        <section className="card">
          <h2>{detail.name} · Purchase history</h2>
          <Button secondary onClick={() => setId("")}>
            Close
          </Button>
          <Table
            rows={detail.purchases}
            columns={[
              { label: "Invoice", render: (p) => p.supplierInvoice },
              { label: "Date", render: (p) => p.invoiceDate },
              { label: "Status", render: (p) => p.status },
              { label: "Total", render: (p) => pk(p.total) },
              {
                label: "Print",
                render: (p) => (
                  <PrintLink
                    path={"/business-documents/purchase/" + p.id}
                    defaultPaper={c.settings.printFormat}
                  />
                ),
              },
            ]}
          />
        </section>
      )}
      {edit && (
        <Modal title="Supplier details" close={() => setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(() =>
                api(
                  "/suppliers" + (edit.id ? "/" + edit.id : ""),
                  edit,
                  edit.id ? "PUT" : "POST",
                ),
              )
                .then(() => setEdit(null))
                .catch(() => {});
            }}
          >
            <div className="form-grid">
              {[
                "name",
                "contactPerson",
                "phone",
                "address",
                "email",
                "remarks",
              ].map((k) => (
                <Field
                  key={k}
                  label={k}
                  required={k === "name"}
                  value={edit[k]}
                  set={(v: string) => setEdit({ ...edit, [k]: v })}
                />
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={edit.active}
                  onChange={(e) =>
                    setEdit({ ...edit, active: e.target.checked })
                  }
                />
                Active
              </label>
            </div>
            <Button disabled={c.busy}>Save supplier</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
