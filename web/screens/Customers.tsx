import React, { useState } from "react";
import {
  api,
  Field,
  Modal,
  Table,
  useData,
  Row,
  pk,
  fmt,
  day,
} from "../shared";
import { Button } from "../components/ui/button";
import { MasterSelect } from "../components/master-data";
import { exportSheet } from "../spreadsheets";
export function CustomerForm({ c, customer, close, onSaved }: any) {
  const [p, set] = useState<Row>({
    name: "",
    mobile: "",
    alternateMobile: "",
    address: "",
    notes: "",
    creditEnabled: false,
    creditLimit: null,
    creditDays: 30,
    active: true,
    ...customer,
    openingBalance: "0",
  });
  return (
    <Modal title={p.id ? "Edit customer" : "New customer"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          c.run(
            () =>
              api(
                "/customers" + (p.id ? "/" + p.id : ""),
                p,
                p.id ? "PUT" : "POST",
              ),
            "Customer saved",
          )
            .then((r: Row) => {
              onSaved?.(r);
              close();
            })
            .catch(() => {});
        }}
      >
        <div className="form-grid">
          {["name", "mobile", "alternateMobile", "address", "notes"].map(
            (k) => (
              <Field
                key={k}
                label={k}
                required={k === "name"}
                value={p[k]}
                set={(v: string) => set({ ...p, [k]: v })}
              />
            ),
          )}
          <MasterSelect
            c={c}
            kind="CUSTOMER_TYPE"
            label="Customer type"
            value={p.typeId}
            set={(v: string) => set({ ...p, typeId: v || null })}
          />
          {c.user.role !== "CASHIER" && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={p.creditEnabled}
                  onChange={(e) =>
                    set({ ...p, creditEnabled: e.target.checked })
                  }
                />
                Credit enabled
              </label>
              <Field
                label="Credit limit (blank = unlimited)"
                type="number"
                value={p.creditLimit}
                set={(v: any) =>
                  set({ ...p, creditLimit: v === "" ? null : String(v) })
                }
              />
              <Field
                label="Credit days"
                type="number"
                value={p.creditDays}
                set={(v: number) => set({ ...p, creditDays: v })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={p.active}
                  onChange={(e) => set({ ...p, active: e.target.checked })}
                />
                Active
              </label>
            </>
          )}
          {!p.id && c.user.role === "ADMIN" && (
            <Field
              label="Authorized opening balance PKR"
              type="number"
              value={p.openingBalance}
              set={(v: any) => set({ ...p, openingBalance: String(v) })}
            />
          )}
        </div>
        <Button disabled={c.busy}>Save customer</Button>
      </form>
    </Modal>
  );
}
export default function Customers(c: any) {
  const [q, search] = useState(""),
    [id, select] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [pay, setPay] = useState<Row | null>(null),
    [manual, setManual] = useState(false),
    [alloc, setAlloc] = useState<Record<string, string>>({});
  const customers =
    useData("/customers?q=" + encodeURIComponent(q), c.version, c.setError) ||
    [];
  const detail = useData(
    id ? "/customers/" + id : "/customers",
    c.version,
    c.setError,
  );
  const banks = useData("/bank-accounts", c.version, c.setError) || [];
  return (
    <>
      <section className="card">
        <div className="toolbar">
          <Field label="Search customers" value={q} set={search} />
          <Button onClick={() => setEdit({})}>New customer</Button>
          <Button
            secondary
            onClick={() => exportSheet(customers, "Customer-outstanding")}
          >
            Export outstanding
          </Button>
        </div>
        <Table
          rows={customers}
          onRow={(r) => select(r.id)}
          columns={[
            { label: "Customer", render: (r) => r.code + " · " + r.name },
            { label: "Mobile", render: (r) => r.mobile },
            {
              label: "Credit",
              render: (r) => (r.creditEnabled ? "Enabled" : "Disabled"),
            },
            { label: "Outstanding", render: (r) => pk(r.outstanding) },
            { label: "Advance", render: (r) => pk(r.advance) },
            {
              label: "Available credit",
              render: (r) =>
                r.availableCredit === null
                  ? "Unlimited"
                  : pk(r.availableCredit),
            },
          ]}
        />
      </section>
      {id && detail?.customer && (
        <section className="card">
          <div className="card-title">
            <h2>{detail.customer.name} · Khata / Credit Ledger</h2>
            <Button secondary onClick={() => select("")}>
              Close
            </Button>
          </div>
          <p>
            Outstanding {pk(detail.outstanding)} · Advance {pk(detail.advance)}{" "}
            · Net balance {pk(detail.netBalance)}
          </p>
          <p>
            A debit increases the amount owed; a credit reduces it. Advances are
            tracked separately.
          </p>
          <div className="toolbar">
            {c.user.role !== "CASHIER" && (
              <Button secondary onClick={() => setEdit(detail.customer)}>
                Edit customer
              </Button>
            )}
            <Button
              onClick={() => {
                setManual(false);
                setAlloc({});
                setPay({
                  customerId: id,
                  amount: "0",
                  method: "CASH",
                  reference: "",
                  paymentDate: day(),
                  remarks: "",
                  allowAdvance: false,
                  cardLastFour: "",
                  terminal: "",
                });
              }}
            >
              Receive payment
            </Button>
            <Button
              secondary
              onClick={() => exportSheet(detail.ledger, "Customer-statement")}
            >
              Export statement
            </Button>
            <Button
              secondary
              onClick={() =>
                window.open(
                  "/api/customers/" + id + "/statement?format=pdf",
                  "_blank",
                  "noopener",
                )
              }
            >
              Print statement
            </Button>
            {c.user.role !== "CASHIER" && (
              <Button
                secondary
                onClick={() => {
                  const amount = prompt("Credit note amount PKR");
                  if (!amount) return;
                  const reason = prompt("Reason");
                  if (reason)
                    c.run(() =>
                      api("/credit-notes", {
                        key: crypto.randomUUID(),
                        customerId: id,
                        amount,
                        reference: crypto.randomUUID(),
                        reason,
                      }),
                    ).catch(() => {});
                }}
              >
                Credit note
              </Button>
            )}
          </div>
          <h3>Invoices and settlement</h3>
          <Table
            rows={detail.accounts}
            columns={[
              {
                label: "Invoice",
                render: (r) => r.sale.invoicePrefix + "-" + r.sale.number,
              },
              { label: "Due date", render: (r) => fmt(r.dueDate) },
              { label: "Original credit", render: (r) => pk(r.original) },
              { label: "Settled", render: (r) => pk(r.settled) },
              { label: "Returned", render: (r) => pk(r.returned) },
              { label: "Outstanding", render: (r) => pk(r.outstanding) },
              { label: "Status", render: (r) => r.status },
            ]}
          />
          <h3>Statement</h3>
          <Table
            rows={detail.ledger}
            columns={[
              { label: "Date", render: (r) => fmt(r.createdAt) },
              { label: "Type", render: (r) => r.type },
              { label: "Reference", render: (r) => r.reference },
              { label: "Debit", render: (r) => pk(r.debit) },
              { label: "Credit", render: (r) => pk(r.credit) },
              { label: "Balance", render: (r) => pk(r.balance) },
              {
                label: "Remarks / entered by",
                render: (r) => r.remarks + " · " + r.createdBy,
              },
            ]}
          />
          <h3>Payment history</h3>
          <Table
            rows={detail.collections}
            columns={[
              { label: "Receipt", render: (r) => "RC-" + r.number },
              { label: "Date", render: (r) => fmt(r.paymentDate) },
              { label: "Amount", render: (r) => pk(r.amount) },
              { label: "Method", render: (r) => r.method },
              {
                label: "Actions",
                render: (r) => (
                  <>
                    <a
                      href={"/api/collections/" + r.id + "/receipt"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Receipt
                    </a>
                    {c.user.role === "ADMIN" && !r.reversal && (
                      <button
                        onClick={() => {
                          const reason = prompt("Reason for reversal");
                          if (reason)
                            c.run(() =>
                              api("/collections/" + r.id + "/reverse", {
                                key: crypto.randomUUID(),
                                reason,
                              }),
                            ).catch(() => {});
                        }}
                      >
                        Reverse
                      </button>
                    )}
                    {r.reversal && "Reversed"}
                  </>
                ),
              },
            ]}
          />
          <h3>Purchase history</h3>
          <Table
            rows={detail.sales}
            columns={[
              { label: "Invoice", render: (r) => r.number },
              { label: "Date", render: (r) => fmt(r.createdAt) },
              { label: "Total", render: (r) => pk(r.total) },
              {
                label: "Print",
                render: (r) => (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={"/api/sales/" + r.id + "/receipt"}
                  >
                    Invoice
                  </a>
                ),
              },
            ]}
          />
        </section>
      )}
      {edit && (
        <CustomerForm c={c} customer={edit} close={() => setEdit(null)} />
      )}
      {pay && (
        <Modal title="Receive customer payment" close={() => setPay(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              c.run(
                () =>
                  api("/collections", {
                    ...pay,
                    key: pay.key || (pay.key = crypto.randomUUID()),
                    ...(manual
                      ? {
                          allocations: Object.entries(alloc)
                            .filter(([, amount]) => Number(amount) > 0)
                            .map(([saleId, amount]) => ({ saleId, amount })),
                        }
                      : {}),
                  }),
                "Payment received",
              )
                .then((r: Row) => {
                  setPay(null);
                  window.open(
                    "/api/collections/" + r.id + "/receipt",
                    "_blank",
                    "noopener",
                  );
                })
                .catch(() => {});
            }}
          >
            <PaymentFields p={pay} set={setPay} banks={banks} />
            <label>
              <input
                type="checkbox"
                checked={pay.allowAdvance}
                onChange={(e) =>
                  setPay({ ...pay, allowAdvance: e.target.checked })
                }
              />
              Record excess as explicit customer advance
            </label>
            <label>
              <input
                type="checkbox"
                checked={manual}
                onChange={(e) => setManual(e.target.checked)}
              />
              Select invoices manually (otherwise oldest first)
            </label>
            {manual &&
              detail.accounts
                .filter((r: Row) => Number(r.outstanding) > 0)
                .map((r: Row) => (
                  <Field
                    key={r.saleId}
                    label={
                      "Invoice " + r.sale.number + " · due " + pk(r.outstanding)
                    }
                    type="number"
                    value={alloc[r.saleId] || ""}
                    set={(v: any) =>
                      setAlloc({ ...alloc, [r.saleId]: String(v) })
                    }
                  />
                ))}
            <Button disabled={c.busy}>Post payment</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function PaymentFields({ p, set, banks, checkout = false }: any) {
  return (
    <div className="form-grid">
      <Field
        label="Payment method"
        value={p.method}
        set={(v: string) => set({ ...p, method: v, bankAccountId: null })}
        options={
          checkout
            ? ["CASH", "CARD", "TRANSFER", "CREDIT", "ADVANCE"]
            : ["CASH", "CARD", "TRANSFER"]
        }
      />
      <Field
        label="Payment amount PKR"
        type="number"
        min="0"
        value={p.amount}
        set={(v: any) => set({ ...p, amount: String(v), key: undefined })}
      />
      {p.method === "CASH" && checkout && (
        <Field
          label="Cash received PKR"
          type="number"
          value={p.tendered ?? p.amount}
          set={(v: any) => set({ ...p, tendered: String(v) })}
        />
      )}
      <Field
        label="Payment reference"
        value={p.reference || ""}
        set={(v: string) => set({ ...p, reference: v })}
      />
      {p.method === "TRANSFER" && (
        <>
          <Field
            label="Bank account"
            value={p.bankAccountId || ""}
            set={(v: string) => set({ ...p, bankAccountId: v })}
            options={[
              { value: "", label: "Select bank account" },
              ...banks.map((b: Row) => ({
                value: b.id,
                label: b.name + " · " + b.bankName,
              })),
            ]}
          />
          <p>
            Transfer is recorded by the operator; external bank verification is
            not available.
          </p>
        </>
      )}
      {p.method === "CARD" && (
        <>
          <Field
            label="Last four digits only"
            maxLength={4}
            value={p.cardLastFour || ""}
            set={(v: string) =>
              set({ ...p, cardLastFour: v.replace(/\D/g, "").slice(0, 4) })
            }
          />
          <Field
            label="Bank / terminal name"
            value={p.terminal || ""}
            set={(v: string) => set({ ...p, terminal: v })}
          />
        </>
      )}
      <Field
        label="Payment date"
        type="date"
        value={p.paymentDate || day()}
        set={(v: string) => set({ ...p, paymentDate: v })}
      />
      <Field
        label="Payment remarks"
        value={p.remarks || ""}
        set={(v: string) => set({ ...p, remarks: v })}
      />
    </div>
  );
}
