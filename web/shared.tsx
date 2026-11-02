import { businessDate } from "../shared/expiry";
import React, { useState, useEffect, useRef } from "react";
import { Package, ChevronLeft, ChevronRight, X } from "lucide-react";
export type Row = Record<string, any>;
export const ErrorContext = React.createContext("");
export const pk = (v: any) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
export const day = businessDate;
export const fmt = (v: any) =>
  v
    ? new Date(v.length === 10 ? v + "T12:00:00Z" : v).toLocaleDateString(
        "en-GB",
        { timeZone: "Asia/Karachi" },
      )
    : "—";
export async function api(path: string, body?: any, method?: string) {
  const r = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "MedicalStore",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await r.json();
  if (!r.ok) {
    if (r.status === 401 && path !== "/auth/login")
      window.dispatchEvent(new Event("signed-out"));
    throw Object.assign(new Error(value.error || "Request failed"), {issues:value.issues});
  }
  return value;
}
export function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Empty({
  text = "No records yet. Create your first entry to get started.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Package size={30} />
      <p>{text}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const error = React.useContext(ErrorContext);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      className={wide ? "modal wide" : "modal"}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {children}
    </dialog>
  );
}
export function Field({
  label,
  name,
  type = "text",
  value,
  set,
  options,
  required = false,
  step,
  ...rest
}: any) {
  return (
    <label className="field">
      <span>{label}</span>
      {options ? (
        <select
          aria-label={label}
          name={name}
          value={value ?? ""}
          onChange={(e) => set(e.target.value)}
          {...rest}
        >
          {options.map((o: any) => (
            <option
              key={typeof o === "string" ? o : o.value}
              value={typeof o === "string" ? o : o.value}
            >
              {typeof o === "string" ? o : o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={label}
          name={name}
          type={type}
          value={value ?? ""}
          onChange={(e) =>
            set(
              type === "number"
                ? e.target.value === ""
                  ? ""
                  : Number(e.target.value)
                : e.target.value,
            )
          }
          required={required}
          step={step || (type === "number" ? "any" : undefined)}
          {...rest}
        />
      )}
    </label>
  );
}
export function Table({
  columns,
  rows,
  onRow,
}: {
  columns: { label: string; render: (r: Row) => React.ReactNode }[];
  rows: Row[];
  onRow?: (r: Row) => void;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows.length]);
  const pages = Math.max(1, Math.ceil(rows.length / 15));
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 15, page * 15 + 15).map((r, i) => (
              <tr
                key={r.id || i}
                onClick={() => onRow?.(r)}
                className={onRow ? "clickable" : ""}
              >
                {columns.map((c, j) => (
                  <td key={j}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty />}
      </div>
      <div className="pagination">
        <span>
          {rows.length} records · page {page + 1} of {pages}
        </span>
        <div>
          <button
            aria-label="Previous page"
            disabled={!page}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-label="Next page"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
export function useData(path: string, version: number, setError: any) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    let current = true;
    api(path)
      .then((v) => current && setData(v))
      .catch((e) => setError(e.message));
    return () => {
      current = false;
    };
  }, [path, version]);
  return data;
}

export function useMedicineSearch(
  query: string,
  version: number,
  fallback: Row[],
  onError: (s: string) => void,
) {
  const [rows, setRows] = useState<Row[]>(fallback);
  useEffect(() => {
    if (!query.trim()) {
      setRows(fallback);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/medicines?q=" + encodeURIComponent(query), {
        signal: controller.signal,
      })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || "Search failed");
          setRows(data);
        })
        .catch((e) => {
          if (e.name !== "AbortError") onError(e.message);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, version, fallback]);
  return rows;
}

/** Refresh expiry labels at Karachi midnight, and after a suspended tab wakes. */
export function useBusinessDate() {
  const [value, setValue] = useState(day());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const current = day();
      setValue(current);
      clearTimeout(timer);
      const next = Date.parse(current + "T00:00:00Z") + 86400000 - 5 * 3600000;
      timer = setTimeout(refresh, Math.max(50, next - Date.now() + 50));
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return value;
}
