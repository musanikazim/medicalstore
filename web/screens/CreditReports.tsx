import React, { useState } from "react";
import { Field, Table, useData, day, Row } from "../shared";
import { exportSheet } from "../spreadsheets";
import { Button } from "../components/ui/button";
export default function CreditReports(c: any) {
  const [kind, setKind] = useState("outstanding"),
    [from, setFrom] = useState(day().slice(0, 7) + "-01"),
    [to, setTo] = useState(day()),
    [customerId, select] = useState("");
  const customers = useData("/customers", c.version, c.setError) || [];
  const query = new URLSearchParams({ kind, from, to, customerId });
  const report = useData("/credit-reports?" + query, c.version, c.setError);
  return (
    <details className="card">
      <summary>Customer credit reports & payment reconciliation</summary>
      <div className="toolbar">
        <Field
          label="Credit report"
          value={kind}
          set={setKind}
          options={[
            "outstanding",
            "statement",
            "credit-sales",
            "collections",
            "overdue",
            "customer-sales",
            "aging",
            "reconciliation",
          ]}
        />
        <Field
          label="Credit report from"
          type="date"
          value={from}
          set={setFrom}
        />
        <Field label="Credit report to" type="date" value={to} set={setTo} />
        <Field
          label="Report customer"
          value={customerId}
          set={select}
          options={[
            { value: "", label: "All customers" },
            ...customers.map((c: Row) => ({ value: c.id, label: c.name })),
          ]}
        />
        <Button secondary onClick={() => exportSheet(report?.rows || [], kind)}>
          Export XLSX
        </Button>
        <a
          className="button secondary"
          target="_blank"
          rel="noreferrer"
          href={"/api/credit-reports?" + query + "&format=pdf"}
        >
          Print / PDF
        </a>
      </div>
      <p>{report?.note}</p>
      <Table
        rows={report?.rows || []}
        columns={Object.keys(report?.rows?.[0] || {})
          .filter((k) => k !== "customerId")
          .map((k) => ({ label: k, render: (r) => r[k] }))}
      />
    </details>
  );
}
