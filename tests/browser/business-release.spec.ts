import { test, expect } from "@playwright/test";
import { businessDate } from "../../shared/expiry";
const headers = { "X-Requested-With": "MedicalStore" };
async function login(page: any) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(process.env.E2E_ADMIN_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
test("supplier management, reorder planning and mapped catalogue import are available", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await page.getByRole("button", { name: "New supplier", exact: true }).click();
  const name = "Release UI supplier " + crypto.randomUUID();
  await page.getByLabel("name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Save supplier", exact: true })
    .click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Stock Reorder", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Stock Reorder Report", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Data Import & Migration", exact: true })
    .click();
  const product = "UI imported " + crypto.randomUUID();
  await page.getByLabel("Import Excel or CSV").setInputFiles({
    name: "catalogue.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Product,Type,Retail\n${product},Pain Relief,\n`),
  });
  await page
    .getByRole("button", { name: "Validate and preview", exact: true })
    .click();
  await expect(page.getByText(product, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm import valid rows", exact: true })
    .click();
  await expect(page.getByText(/Successful 1/)).toBeVisible();
  await page.getByRole("button", { name: "Medicines", exact: true }).click();
  await page.getByLabel("Search medicines").fill(product);
  await expect(page.getByText(product, { exact: true })).toBeVisible();
  await page.getByLabel("Incomplete Product Details").check();
  await expect(page.getByText(product, { exact: true })).toBeVisible();
});
test("statements retain brand and historical items; reminders preview without sending", async ({
  page,
}) => {
  await login(page);
  const name = "Reminder customer " + crypto.randomUUID();
  const response = await page.request.post("/api/customers", {
    headers,
    data: { name, mobile: "03001234567", openingBalance: "3500" },
  });
  expect(response.ok()).toBeTruthy();
  const c = await response.json();
  await page.request.put("/api/settings", {
    headers,
    data: { storeName: "Release Dynamic Store", phone: "03005551234" },
  });
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.getByLabel("Search customers").fill(name);
  await page
    .getByRole("button", { name: "Send WhatsApp Reminder", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "WhatsApp reminder preview",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Editable message" }),
  ).toHaveValue(/Release Dynamic Store/);
  await expect(
    page.getByRole("textbox", { name: "Editable message" }),
  ).toHaveValue(/3500.00/);
  // Do not open WhatsApp or send messages during automated testing.
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  for (const paper of ["A4", "80", "58"]) {
    const pdf = await page.request.get(
      `/api/customers/${c.id}/statement?paper=${paper}&mode=detailed`,
    );
    expect(pdf.ok()).toBeTruthy();
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  }
  const data = await (
    await page.request.get(`/api/customers/${c.id}/statement?format=json`)
  ).json();
  expect(data.closing).toBe("3500.00");
});
test("reminders and imports reject unauthorized cashiers", async ({ page }) => {
  await login(page);
  const suffix = crypto.randomUUID(),
    email = `cashier-${suffix}@example.com`,
    password = crypto.randomUUID();
  await page.request.post("/api/users", {
    headers,
    data: { email, name: "Release cashier", password, role: "CASHIER" },
  });
  await page.request.post("/api/auth/logout", { headers, data: {} });
  const r = await page.request.post("/api/auth/login", {
    headers,
    data: { email, password },
  });
  expect(r.ok()).toBeTruthy();
  expect(
    (
      await page.request.post("/api/imports/preview", {
        headers,
        data: {
          kind: "customers",
          rows: [{ name: "X", mobile: "03001234567" }],
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await page.request.get("/api/customers/unknown/reminder")).status(),
  ).toBe(403);
});
test("financial document previews cover all paper sizes without reposting money or stock", async ({
  page,
}) => {
  await login(page);
  const post = async (path: string, data: any) => {
    const r = await page.request.post("/api" + path, { headers, data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const suffix = crypto.randomUUID();
  const customer = await post("/customers", {
    name: "Document customer " + suffix,
    mobile: "03001234567",
    creditEnabled: true,
  });
  const medicine = await post("/medicines", {
    name: "Document item " + suffix,
    salePrice: "10",
    purchasePrice: "2",
  });
  const batch = await post("/opening", {
    key: crypto.randomUUID(),
    medicineId: medicine.id,
    batchNumber: "DOC",
    expiry: "2035-12-31",
    quantity: 10,
    unit: "base",
    unitCost: "2",
    reference: suffix,
  });
  const sale = await post("/sales", {
    key: crypto.randomUUID(),
    customerId: customer.id,
    lines: [{ medicineId: medicine.id, unit: "base", quantity: 2 }],
    payments: [{ method: "CREDIT", amount: "20" }],
  });
  const payment = await post("/collections", {
    key: crypto.randomUUID(),
    customerId: customer.id,
    amount: "5",
    method: "CASH",
    paymentDate: businessDate(),
  });
  await post(`/collections/${payment.id}/reverse`, {
    key: crypto.randomUUID(),
    reason: "Duplicate entry corrected",
  });
  const sales = await (await page.request.get("/api/sales")).json(),
    allocation = sales.find((s: any) => s.id === sale.id).lines[0]
      .allocations[0];
  const returned = await post("/returns", {
    key: crypto.randomUUID(),
    type: "SALE",
    originalId: allocation.id,
    quantity: 1,
    reason: "Returned item",
    reference: "RET-DOC",
  });
  const credit = await post("/credit-notes", {
    key: crypto.randomUUID(),
    customerId: customer.id,
    amount: "2",
    reference: "Adjustment DOC",
    reason: "Agreed adjustment",
  });
  const supplier = await post("/suppliers", {
    name: "Document supplier " + suffix,
  });
  const purchase = await post("/purchases", {
    supplierId: supplier.id,
    supplierInvoice: "DOC-INV",
    invoiceDate: businessDate(),
    receivingDate: businessDate(),
    lines: [
      {
        medicineId: medicine.id,
        batchNumber: "DOC-PUR",
        expiry: "2035-12-31",
        quantity: 2,
        unit: "base",
        unitCost: "2",
        sellingPrice: "10",
      },
    ],
  });
  await post("/adjustments", {
    key: crypto.randomUUID(),
    batchId: batch.id,
    quantity: -1,
    reason: "Document test adjustment",
    reference: suffix,
  });
  const movements = await (await page.request.get("/api/movements")).json();
  const movement = movements.find(
    (m: any) => m.reference === suffix && m.type === "ADJUSTMENT",
  );
  expect(movement).toBeTruthy();
  for (const path of [
    `/sales/${sale.id}/receipt`,
    `/business-documents/payment/${payment.id}`,
    `/business-documents/reversal/${payment.id}`,
    `/business-documents/return/${returned.id}`,
    `/business-documents/refund/${returned.id}`,
    `/business-documents/credit-note/${credit.id}`,
    `/business-documents/purchase/${purchase.id}`,
    `/business-documents/adjustment/${movement.id}`,
  ]) {
    for (const paper of ["A4", "80", "58"]) {
      const r = await page.request.get("/api" + path + "?paper=" + paper);
      expect(r.ok(), path).toBeTruthy();
      expect((await r.body()).subarray(0, 4).toString()).toBe("%PDF");
    }
  }
  const statement = await (
    await page.request.get(
      `/customers/${customer.id}/statement?format=json`.replace(/^/, "/api"),
    )
  ).json();
  expect(statement.closing).toBe("8.00");
  expect((await (await page.request.get("/api/sales")).json()).length).toBe(
    sales.length,
  );
});
