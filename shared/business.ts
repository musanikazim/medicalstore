export const normalizeName = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
export function mobileNumber(value: unknown, country = "92") {
  let n = String(value ?? "").replace(/[\s()+.-]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0")) n = country + n.slice(1);
  else if (country === "92" && /^3\d{9}$/.test(n)) n = country + n;
  if (country === "92" ? !/^923\d{9}$/.test(n) : !/^[1-9]\d{7,14}$/.test(n))
    return null;
  return n;
}
export const reminderTemplates = {
  en: "Assalam-o-Alaikum {customer},\n\nThis is a friendly payment reminder from {store}.\nYour current outstanding balance is PKR {balance}.\nPlease clear your outstanding payment at your earliest convenience. If you have already paid, please disregard this reminder.\n\nThank you.\n{store}\n{contact}",
  ur: "Assalam-o-Alaikum {customer},\n\n{store} ki taraf se adaigi ki yaad dehani. Aap ka baqaya PKR {balance} hai. Barah-e-karam apni sahulat ke mutabiq adaigi kar dein. Agar adaigi kar chukay hain to is paigham ko nazar andaz karein.\n\nShukriya.\n{store}\n{contact}",
};
export function reminderMessage(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(
    /\{(customer|store|balance|contact)\}/g,
    (_, k) => values[k] || "",
  );
}
export function businessReference(value: unknown) {
  const s = String(value || "");
  if (/^Import [0-9a-f-]{36}:\d+$/i.test(s)) return "Imported purchase";
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s) ? "" : s;
}
export const ledgerLabels: Record<string, string> = {
  OPENING: "Opening balance",
  CREDIT_SALE: "Credit sale",
  PAYMENT: "Payment received",
  COLLECTION: "Payment received",
  ADVANCE: "Customer advance",
  ADVANCE_APPLIED: "Advance applied",
  PAYMENT_REVERSAL: "Payment reversal",
  CREDIT_NOTE: "Credit adjustment",
  RETURN: "Sales return",
  SALE_RETURN: "Sales return",
};
