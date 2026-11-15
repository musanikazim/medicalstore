import React, { useState } from "react";
import { api, Field, Table, useData } from "../shared";
import { Button } from "../components/ui/button";
import { readSheet, exportSheet, worksheetNames } from "../spreadsheets";
import { importFields, suggestMapping } from "../../shared/imports";
export default function DataImport(c: any) {
  const [kind, setKind] = useState("catalogue"),
    [file, setFile] = useState<File | null>(null),
    [sheets, setSheets] = useState<string[]>([]),
    [sheet, setSheet] = useState(0),
    [rows, setRows] = useState<any[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [duplicates, setDuplicates] = useState("review"),
    [createCategories, setCreate] = useState(false),
    [stockImpact, setImpact] = useState(false),
    [confirmStock, setConfirmStock] = useState(false),
    [job, setJob] = useState<any>(null),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const jobs = useData("/imports", c.version, c.setError) || [],
    profiles = useData("/import-mappings", c.version, c.setError) || [],
    history = useData("/imports/history-records", c.version, c.setError) || [];
  const load = async (f: File, index: number) => {
    const r = await readSheet(f, index, true);
    setRows(r);
    setMapping(suggestMapping(Object.keys(r[0] || {}), kind));
    setJob(null);
    setResult(null);
  };
  const execute = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e: any) {
      c.setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="card">
        <h2>Data Import & Migration</h2>
        <p>
          Optional onboarding: configure your store in Settings, then import
          catalogue, suppliers, customers, opening inventory and opening
          balances. You can start blank and import later. Demo data is optional
          during fresh setup. Catalogue imports never post stock. Financial and
          stock imports require complete operational data.
        </p>
        <p>
          Required catalogue fields: Medicine Name and Category only. Customer
          import requires name and contact number only. Supplier import requires
          name only. Other master fields are optional. Stock and financial rows
          need valid operational quantities, costs, dates and references.
        </p>
        <h3>1. Upload</h3>
        <div className="toolbar">
          <Field
            label="Import type"
            value={kind}
            set={(v: string) => {
              setKind(v);
              setRows([]);
              setJob(null);
              setFile(null);
              setImpact(false);
              setConfirmStock(false);
            }}
            options={Object.keys(importFields).map((k) => ({
              value: k,
              label: k.replaceAll("-", " "),
            }))}
          />
          <Button
            secondary
            onClick={() => {
              exportSheet(
                [Object.fromEntries(importFields[kind].map((k) => [k, ""]))],
                `${kind}-template.xlsx`,
              );
            }}
          >
            Download Excel template
          </Button>
          <input
            key={kind}
            aria-label="Import Excel or CSV"
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                execute(async () => {
                  setFile(f);
                  setSheets(await worksheetNames(f));
                  setSheet(0);
                  await load(f, 0);
                });
            }}
          />
        </div>
        {file && (
          <Field
            label="Excel worksheet"
            value={String(sheet)}
            options={sheets.map((n, i) => ({ value: String(i), label: n }))}
            set={(v: string) => {
              setSheet(Number(v));
              execute(() => load(file, Number(v)));
            }}
          />
        )}
        {rows.length > 0 && (
          <>
            <h3>2. Map columns and preview</h3>
            <p>
              {rows.length} uploaded rows. Dates: YYYY-MM-DD or DD/MM/YYYY.
              Phone values remain text. Unknown stock information is staged as
              invalid with an error report; correct it and preview again.
            </p>
            <div className="toolbar">
              <Field
                label="Reusable mapping"
                value=""
                set={(v: string) => {
                  const p = profiles.find((p: any) => p.id === v);
                  if (p) setMapping(p.mapping);
                  setJob(null);
                }}
                options={[
                  { value: "", label: "Select mapping profile" },
                  ...profiles
                    .filter((p: any) => p.kind === kind)
                    .map((p: any) => ({ value: p.id, label: p.name })),
                ]}
              />
              <Button
                secondary
                onClick={() => {
                  const name = prompt("Mapping profile name");
                  if (name)
                    execute(() =>
                      api("/import-mappings", { name, kind, mapping }),
                    );
                }}
              >
                Save mapping profile
              </Button>
              <Field
                label="Existing record policy"
                value={duplicates}
                set={(v: string) => {
                  setDuplicates(v);
                  setJob(null);
                }}
                options={["review", "skip", "update"]}
              />
            </div>
            <Table
              rows={Object.keys(rows[0]).map((h) => ({ header: h }))}
              columns={[
                { label: "Uploaded column", render: (r) => r.header },
                {
                  label: "System field",
                  render: (r) => (
                    <select
                      value={mapping[r.header] || ""}
                      onChange={(e) => {
                        setMapping({ ...mapping, [r.header]: e.target.value });
                        setJob(null);
                      }}
                    >
                      <option value="">Ignore</option>
                      {importFields[kind].map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  ),
                },
              ]}
            />
            {kind === "catalogue" && (
              <label>
                <input
                  type="checkbox"
                  checked={createCategories}
                  onChange={(e) => {
                    setCreate(e.target.checked);
                    setJob(null);
                  }}
                />
                Confirm creation of missing categories
              </label>
            )}
            {kind === "purchases" && (
              <label>
                <input
                  type="checkbox"
                  checked={stockImpact}
                  onChange={(e) => {
                    setImpact(e.target.checked);
                    setJob(null);
                    setConfirmStock(false);
                  }}
                />
                Stock-impacting purchases (otherwise historical records only)
              </label>
            )}
            {["sales", "purchases"].includes(kind) && (
              <p>
                Historical records-only imports are a separate archive: they do
                not change stock, customer receivables or supplier balances.
                Invoice total is repeated on each item row; line quantity ×
                price − discount + tax must reconcile. Historical sales are
                records-only.
              </p>
            )}
            <Button
              disabled={busy}
              onClick={() =>
                execute(async () => {
                  const fields = Object.values(mapping).filter(Boolean);
                  if (new Set(fields).size !== fields.length)
                    throw new Error("Map each system field only once");
                  const mapped = rows.map((row) =>
                    Object.fromEntries(
                      Object.entries(mapping)
                        .filter(([, field]) => field)
                        .map(([h, field]) => [field, row[h]]),
                    ),
                  );
                  const j = await api("/imports/preview", {
                    kind,
                    filename: file?.name || "Import",
                    rows: mapped,
                    options: { duplicates, createCategories, stockImpact },
                  });
                  setJob(j);
                  setResult(null);
                })
              }
            >
              Validate and preview
            </Button>
          </>
        )}
        {job && (
          <>
            <h3>3. Review and confirm</h3>
            <p>
              Total {job.rows.length} · Valid{" "}
              {
                job.rows.filter((r: any) =>
                  ["NEW", "UPDATE"].includes(r.status),
                ).length
              }{" "}
              · Invalid{" "}
              {job.rows.filter((r: any) => r.status === "INVALID").length} ·
              Duplicates {job.rows.filter((r: any) => r.duplicateId).length} ·
              New {job.rows.filter((r: any) => r.status === "NEW").length} ·
              Updates{" "}
              {job.rows.filter((r: any) => r.status === "UPDATE").length}
            </p>
            <Table
              rows={job.rows}
              columns={[
                { label: "Row", render: (r) => r.row },
                {
                  label: "Record",
                  render: (r) => r.payload.name || r.payload.reference,
                },
                { label: "Action", render: (r) => r.status },
                { label: "Validation", render: (r) => r.error || "Ready" },
              ]}
            />
            <Button
              secondary
              onClick={() =>
                exportSheet(
                  job.rows
                    .filter((r: any) => r.error || r.status === "REVIEW")
                    .map((r: any) => ({
                      row: r.row,
                      status: r.status,
                      error: r.error,
                      ...r.source,
                      ...r.payload,
                    })),
                  "import-errors.xlsx",
                )
              }
            >
              Download error report
            </Button>
            {stockImpact && (
              <label>
                <input
                  type="checkbox"
                  checked={confirmStock}
                  onChange={(e) => setConfirmStock(e.target.checked)}
                />
                I confirm these purchases must increase inventory and do not
                duplicate opening stock.
              </label>
            )}
            <Button
              disabled={busy || (stockImpact && !confirmStock)}
              onClick={() =>
                execute(async () => {
                  const r = await c.run(
                    () =>
                      api(`/imports/${job.id}/commit`, {
                        confirmStockImpact: confirmStock,
                      }),
                    "Import processed",
                  );
                  setResult(r);
                })
              }
            >
              Confirm import valid rows
            </Button>
            {result && (
              <>
                <p>
                  Successful {result.successful} · Skipped {result.skipped} ·
                  Failed {result.failed}. Retrying this job does not repost
                  successful records.
                </p>
                <Table
                  rows={result.results}
                  columns={[
                    { label: "Row", render: (r) => r.rowNumber },
                    { label: "Status", render: (r) => r.status },
                    { label: "Error", render: (r) => r.result?.error || "" },
                  ]}
                />
              </>
            )}
          </>
        )}
      </section>
      <section className="card">
        <h3>Import history</h3>
        <Table
          rows={jobs}
          columns={[
            { label: "File", render: (j) => j.filename },
            { label: "Type", render: (j) => j.kind },
            { label: "Date", render: (j) => j.createdAt },
            { label: "Status", render: (j) => j.status },
            {
              label: "Result",
              render: (j) =>
                `${j.result?.successful || 0} successful / ${j.result?.failed || 0} failed`,
            },
            {
              label: "Review / retry",
              render: (j) => (
                <Button
                  secondary
                  onClick={() => {
                    setKind(j.kind);
                    setJob(j);
                    setImpact(!!j.options.stockImpact);
                    setConfirmStock(false);
                    setResult(j.result);
                  }}
                >
                  Open job
                </Button>
              ),
            },
          ]}
        />
        <h3>Historical records archive</h3>
        <Table
          rows={history}
          columns={[
            { label: "Type", render: (h) => h.kind },
            { label: "Reference", render: (h) => h.reference },
            { label: "Date", render: (h) => h.date },
            { label: "Total", render: (h) => h.total },
            {
              label: "Items",
              render: (h) => (
                <details>
                  <summary>View original imported details</summary>
                  <pre>{JSON.stringify(h.data, null, 2)}</pre>
                </details>
              ),
            },
          ]}
        />
      </section>
    </>
  );
}
