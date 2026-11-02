import React from "react";
import { Badge, Field } from "../shared";
import { expiryStatus, expiryThreshold } from "../../shared/expiry";
export function ExpiryBadge({
  expiry,
  settings,
  date,
}: {
  expiry: string;
  settings: any;
  date: string;
}) {
  const info = expiryStatus(expiry, expiryThreshold(settings), date);
  if (info.status === "INVALID") return null;
  const label =
    info.status === "EXPIRED"
      ? "Expired"
      : info.status === "TODAY"
        ? "Expires Today"
        : info.status === "SOON"
          ? `Expiring in ${info.days} days`
          : "Normal";
  return (
    <Badge
      tone={
        info.status === "NORMAL"
          ? "green"
          : info.status === "EXPIRED"
            ? "red"
            : "amber"
      }
    >
      {label}
    </Badge>
  );
}
export function ExpiryWarning({
  expiry,
  settings,
  date,
  checked,
  onCheck,
  status = "SELLABLE",
}: {
  expiry: string;
  settings: any;
  date: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  status?: string;
}) {
  if (!expiry) return null;
  const threshold = expiryThreshold(settings),
    info = expiryStatus(expiry, threshold, date);
  if (status !== "SELLABLE")
    return (
      <small className="expiry-note">
        Restricted stock is not available for POS sales.
      </small>
    );
  if (info.blocked)
    return (
      <p className="expiry-entry blocked" role="alert">
        {info.status === "TODAY"
          ? "This medicine expires today."
          : info.status === "EXPIRED"
            ? "This medicine is already expired."
            : "Select a valid expiry date."}{" "}
        Normal sellable stock entry is blocked. Use quarantined stock where
        appropriate.
      </p>
    );
  if (!info.requiresAcknowledgement) return null;
  return (
    <div className="expiry-entry" aria-live="polite">
      <p>
        This medicine will expire in {info.days} days. The configured expiry
        warning threshold is {threshold} days. Please verify before proceeding.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onCheck(e.target.checked)}
        />
        Ignore Expiry Warning
      </label>
    </div>
  );
}
export function ExpiryField({
  label = "Expiry date",
  value,
  set,
  settings,
  date,
  checked,
  onCheck,
  status = "SELLABLE",
}: any) {
  return (
    <div className="expiry-field">
      <Field
        label={label}
        type="date"
        value={value}
        set={(v: string) => {
          set(v);
          onCheck(false);
        }}
        required
      />
      <ExpiryWarning
        expiry={value}
        settings={settings}
        date={date}
        checked={checked}
        onCheck={onCheck}
        status={status}
      />
    </div>
  );
}
export function entryBlocked(row: any, settings: any, date: string) {
  const info = expiryStatus(row.expiry || "", expiryThreshold(settings), date);
  return (
    (row.status || "SELLABLE") === "SELLABLE" &&
    (info.blocked || (info.requiresAcknowledgement && !row.ignoreExpiryWarning))
  );
}
