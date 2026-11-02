import { test, expect, type Page } from "@playwright/test";
const guard = { "X-Requested-With": "MedicalStore" };
async function login(page: Page) {
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
async function create(page: Page, path: string, data: any) {
  const r = await page.request.post("/api" + path, { headers: guard, data });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function fixture(page: Page) {
  const m = await create(page, "/medicines", {
    name: "Browser enhanced " + crypto.randomUUID(),
    salePrice: "10",
    purchasePrice: "2",
    mrp: "8",
    unitsPerStrip: 1,
    stripsPerBox: 1,
  });
  await create(page, "/opening", {
    key: crypto.randomUUID(),
    medicineId: m.id,
    batchNumber: "UI-" + crypto.randomUUID(),
    expiry: "2035-12-31",
    quantity: 20,
    unit: "base",
    unitCost: "2",
    reference: crypto.randomUUID(),
  });
  return m;
}
test("inline category and dosage creation preserve product data, optional barcode and MRP warning", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Medicines", exact: true }).click();
  await page.getByRole("button", { name: "Add medicine", exact: true }).click();
  const name = "UI product " + crypto.randomUUID(),
    cat = "UI category " + crypto.randomUUID(),
    form = "UI sachet " + crypto.randomUUID();
  await page.getByLabel("Medicine name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "+ Add New Category", exact: true })
    .click();
  await page.getByLabel("Category name", { exact: true }).fill(cat);
  await page
    .getByRole("button", { name: "Save Category", exact: true })
    .click();
  await expect(page.getByLabel("Medicine name", { exact: true })).toHaveValue(
    name,
  );
  await expect(page.getByLabel("Category", { exact: true })).toHaveText(
    new RegExp(cat),
  );
  await page
    .getByRole("button", { name: "+ Add New Dosage Form", exact: true })
    .click();
  await page.getByLabel("Dosage Form name", { exact: true }).fill(form);
  await page
    .getByRole("button", { name: "Save Dosage Form", exact: true })
    .click();
  await expect(
    page.getByLabel("Dosage Form name", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Sale price / base", { exact: true }).fill("10");
  await page.getByLabel("MRP / base (optional)", { exact: true }).fill("8");
  await expect(
    page.locator("dialog").filter({ hasText: "Save medicine" }),
  ).toContainText("exceeds MRP");
  await page
    .getByRole("button", { name: "Save medicine", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Medicine saved");
  const matches = await (
    await page.request.get("/api/medicines?q=" + encodeURIComponent(name))
  ).json();
  expect(matches[0].barcode).toBeNull();
  expect(matches[0].category).toBe(cat);
  expect(matches[0].form).toBe(form);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Master Data Management", exact: true })
    .click();
  await page.getByLabel("Search master data").fill(cat);
  await expect(page.getByRole("row").filter({ hasText: cat })).toBeVisible();
});
test("database carts survive navigation, refresh, multiple holds and current-price revalidation", async ({
  page,
}) => {
  await login(page);
  const m = await fixture(page);
  await page.getByRole("button", { name: "POS / Sales", exact: true }).click();
  await page.getByLabel("Scan barcode or search medicines").fill(m.name);
  await page.getByLabel("Scan barcode or search medicines").press("Enter");
  await expect(page.getByLabel("Quantity for " + m.name)).toHaveValue("1");
  await expect(
    page.getByText("Saved to store database", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Medicines", exact: true }).click();
  await page.getByRole("button", { name: "POS / Sales", exact: true }).click();
  await page.getByRole("button", { name: "Resume Draft", exact: true }).click();
  await expect(page.getByLabel("Quantity for " + m.name)).toHaveValue("1");
  await page.reload();
  await page.getByRole("button", { name: "POS / Sales", exact: true }).click();
  await page.getByRole("button", { name: "Resume Draft", exact: true }).click();
  await expect(page.getByLabel("Quantity for " + m.name)).toHaveValue("1");
  await page
    .getByRole("button", { name: "Hold Sale / Start New Sale", exact: true })
    .click();
  await expect(page.getByLabel("Quantity for " + m.name)).toHaveCount(0);
  await page.getByLabel("Scan barcode or search medicines").fill(m.name);
  await page.getByLabel("Scan barcode or search medicines").press("Enter");
  await page
    .getByRole("button", { name: "Hold Sale / Start New Sale", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Held sales & saved drafts" })
    .click();
  const rows = page.getByRole("row").filter({
    has: page.getByRole("button", { name: "Resume Sale", exact: true }),
  });
  await expect(rows).toHaveCount(2);
  const latest = await (
    await page.request.get("/api/medicines?q=" + encodeURIComponent(m.name))
  ).json();
  const r = await page.request.put("/api/medicines/" + m.id, {
    headers: guard,
    data: { ...latest[0], salePrice: "12" },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  await rows
    .first()
    .getByRole("button", { name: "Resume Sale", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Accept current price" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept current price" }).click();
  await page.getByLabel("Cash received PKR", { exact: true }).fill("20");
  await page.getByRole("button", { name: /^Complete sale/ }).click();
  await expect(
    page.getByRole("heading", { name: "Sale completed", exact: true }),
  ).toBeVisible();
  for (const format of ["58", "80", "A4"]) {
    const pdf = await page.request.get(
      "/api/sales/" +
        (await (await page.request.get("/api/sales")).json())[0].id +
        "/receipt?format=" +
        format,
    );
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  }
});
test("customer creation, credit approval, split sale and partial collection in browser", async ({
  page,
}) => {
  await login(page);
  const m = await fixture(page);
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.getByRole("button", { name: "New customer", exact: true }).click();
  const name = "UI customer " + crypto.randomUUID();
  await page.getByLabel("name", { exact: true }).fill(name);
  await page.getByLabel("mobile", { exact: true }).fill("03000000000");
  await page.getByLabel("Credit enabled", { exact: true }).check();
  await page.getByLabel("Credit limit (blank = unlimited)").fill("50");
  await page
    .getByRole("button", { name: "Save customer", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Customer saved");
  await page.getByRole("button", { name: "POS / Sales", exact: true }).click();
  await page.getByLabel("Scan barcode or search medicines").fill(m.name);
  await page.getByLabel("Scan barcode or search medicines").press("Enter");
  const selectedCustomers = await (
    await page.request.get("/api/customers?q=" + encodeURIComponent(name))
  ).json();
  await page
    .getByLabel("Customer", { exact: true })
    .selectOption(selectedCustomers[0].id);
  await page
    .getByRole("button", { name: "Add split payment", exact: true })
    .click();
  await page.getByLabel("Payment amount PKR", { exact: true }).fill("4");
  await page
    .getByRole("button", { name: "Add split payment", exact: true })
    .click();
  await page
    .getByLabel("Payment method", { exact: true })
    .nth(1)
    .selectOption("CREDIT");
  await page.getByRole("button", { name: /^Complete sale/ }).click();
  await expect(
    page.getByRole("heading", { name: "Sale completed", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.getByLabel("Search customers", { exact: true }).fill(name);
  await page.getByRole("row").filter({ hasText: name }).click();
  await expect(
    page.getByRole("heading", { name: name + " · Khata / Credit Ledger" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Receive payment", exact: true })
    .click();
  await page
    .getByLabel("Payment amount PKR", { exact: true })
    .filter({ visible: true })
    .fill("2");
  await page.getByRole("button", { name: "Post payment", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Payment received");
  const customers = await (
    await page.request.get("/api/customers?q=" + encodeURIComponent(name))
  ).json();
  expect(customers[0].outstanding).toBe("4.00");
  await expect(
    page.getByRole("row").filter({ hasText: "Partially Paid" }),
  ).toBeVisible();
});
