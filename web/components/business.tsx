import React, { useState } from "react";
import { api, Field, Modal, pk, Table, useData } from "../shared";
import { mobileNumber } from "../../shared/business";
import { Button } from "./ui/button";
export function PrintLink({
  path,
  label = "Print / PDF",
  defaultPaper = "A4",
}: any) {
  const [open, setOpen] = useState(false),
    [paper, setPaper] = useState(defaultPaper);
  const url =
    "/api" + path + (path.includes("?") ? "&" : "?") + "paper=" + paper;
  return (
    <>
      <Button secondary onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <Modal wide title="Print preview" close={() => setOpen(false)}>
          <Field
            label="Paper format"
            value={paper}
            set={setPaper}
            options={[
              { value: "A4", label: "A4 Professional" },
              { value: "80", label: "80mm Thermal" },
              { value: "58", label: "58mm Thermal" },
            ]}
          />
          <p>
            Use the PDF viewer's Print or Download control. Match printer paper
            size and disable browser headers.
          </p>
          <a href={url} target="_blank" rel="noreferrer">
            Open PDF in a separate tab
          </a>
          <iframe
            title="Business document preview"
            src={url}
            style={{ width: "100%", height: "65vh", border: 0 }}
          />
        </Modal>
      )}
    </>
  );
}
export function ReminderButton({ c, customer }: any) {
  const [preview, setPreview] = useState<any>(null),
    [language, setLanguage] = useState("en"),
    [busy, setBusy] = useState(false);
  if (c.user.role === "CASHIER") return null;
  const load = async (lang = language) => {
    setBusy(true);
    try {
      setPreview(
        await api(`/customers/${customer.id}/reminder?language=${lang}`),
      );
    } catch (e: any) {
      c.setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        secondary
        disabled={
          busy ||
          !mobileNumber(
            customer.mobile,
            c.settings.reminderCountryCode || "92",
          ) ||
          Number(customer.netBalance ?? customer.outstanding) <= 0
        }
        onClick={(e: any) => {
          e.stopPropagation();
          load();
        }}
      >
        Send WhatsApp Reminder
      </Button>
      {preview && (
        <Modal title="WhatsApp reminder preview" close={() => setPreview(null)}>
          <p>
            Current outstanding: {pk(preview.balance)}. This free integration
            uses the WhatsApp account signed in on this device. You must press
            Send in WhatsApp; opening a conversation does not confirm delivery.
          </p>
          <Field
            label="Language"
            value={language}
            options={[
              { value: "en", label: "English" },
              { value: "ur", label: "Roman Urdu" },
            ]}
            set={(v: string) => {
              setLanguage(v);
              load(v);
            }}
          />
          <label className="field">
            Editable message
            <textarea
              rows={12}
              value={preview.message}
              onChange={(e) =>
                setPreview({ ...preview, message: e.target.value })
              }
            />
          </label>
          <Button
            disabled={busy || !preview.message.trim()}
            onClick={async () => {
              try {
                const latest = await api(
                  `/customers/${customer.id}/reminder?language=${language}`,
                );
                if (
                  latest.balance !== preview.balance ||
                  latest.number !== preview.number
                ) {
                  setPreview(latest);
                  c.setError(
                    "Balance or mobile changed. Review the updated message.",
                  );
                  return;
                }
                window.open(
                  `https://wa.me/${latest.number}?text=${encodeURIComponent(preview.message)}`,
                  "_blank",
                  "noopener,noreferrer",
                );
              } catch (e: any) {
                c.setError(e.message);
              }
            }}
          >
            Open WhatsApp conversation
          </Button>
        </Modal>
      )}
    </>
  );
}
export function CustomerStatement({ c, id }: any) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [mode, setMode] = useState("summary");
  const path = `/customers/${id}/statement?from=${from}&to=${to}&mode=${mode}`;
  const data = useData(path + "&format=json", c.version, c.setError);
  return (
    <section>
      <h3>Customer statement</h3>
      <div className="toolbar">
        <Field label="Statement from" type="date" value={from} set={setFrom} />
        <Field label="Statement to" type="date" value={to} set={setTo} />
        <Field
          label="Statement mode"
          value={mode}
          set={setMode}
          options={["summary", "detailed"]}
        />
        <PrintLink
          path={path}
          label="Preview statement / PDF"
          defaultPaper={c.settings.statementPrintFormat || "A4"}
        />
      </div>
      <p>
        Opening {pk(data?.opening)} · Debit {pk(data?.debit)} · Credit{" "}
        {pk(data?.credit)} · Closing {pk(data?.closing)}
      </p>
      <Table
        rows={data?.rows || []}
        columns={[
          { label: "Date", render: (r) => r.date },
          { label: "Document No.", render: (r) => r.document },
          { label: "Particulars", render: (r) => r.particulars },
          { label: "Debit PKR", render: (r) => pk(r.debit) },
          { label: "Credit PKR", render: (r) => pk(r.credit) },
          { label: "Balance PKR", render: (r) => pk(r.balance) },
          {
            label: "Details",
            render: (r) => (
              <>
                {r.remarks}
                {r.returnDetails && (
                  <p>
                    Return: {r.returnDetails.item} · {r.returnDetails.quantity}{" "}
                    base units · {r.returnDetails.reason}
                  </p>
                )}
                {r.invoice && (
                  <details open={mode === "detailed"}>
                    <summary>Invoice items</summary>
                    <Table
                      rows={r.invoice.lines}
                      columns={[
                        { label: "Item", render: (l) => l.name },
                        { label: "Unit", render: (l) => l.unitLabel || l.unit },
                        { label: "Qty", render: (l) => l.quantity },
                        { label: "Price", render: (l) => pk(l.price) },
                        { label: "Discount", render: (l) => pk(l.discount) },
                        { label: "Total", render: (l) => pk(l.net) },
                      ]}
                    />
                    <p>
                      Invoice total {pk(r.invoice.total)} · Discount{" "}
                      {pk(r.invoice.discount)} · Tax {pk(r.invoice.tax)}
                    </p>
                  </details>
                )}
              </>
            ),
          },
        ]}
      />
    </section>
  );
}
