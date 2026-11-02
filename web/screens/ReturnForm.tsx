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
} from "../shared";
export default function ReturnForm({ c, type, original, close }: any) {
  const [p, setP] = useState<Row>({
    key: crypto.randomUUID(),
    type,
    originalId: original.id,
    quantity: 1,
    reason: "",
    reference: "",
    disposition: "QUARANTINED",
  });
  return (
    <Modal
      title={
        type === "SALE" ? "Return sold medicine" : "Return stock to supplier"
      }
      close={close}
    >
      <p>
        Quantities are in base units. Customer returns remain quarantined unless
        inspected and explicitly marked sellable.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          c.run(() => api("/returns", p), "Return recorded")
            .then(close)
            .catch(() => {});
        }}
      >
        <Field
          label="Quantity (base units)"
          type="number"
          min="1"
          step="1"
          value={p.quantity}
          set={(v: any) => setP({ ...p, quantity: v })}
          required
        />
        <Field
          label="Reason"
          value={p.reason}
          set={(v: any) => setP({ ...p, reason: v })}
          required
        />
        <Field
          label="Reference / credit note"
          value={p.reference}
          set={(v: any) => setP({ ...p, reference: v })}
          required
        />
        {type === "SALE" && (
          <Field
            label="Inspected disposition"
            value={p.disposition}
            set={(v: any) => setP({ ...p, disposition: v })}
            options={["QUARANTINED", "SELLABLE", "DAMAGED"]}
          />
        )}
        <div className="modal-actions">
          <Button disabled={c.busy}>Confirm return</Button>
        </div>
      </form>
    </Modal>
  );
}
