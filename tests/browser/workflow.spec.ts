import { test, expect } from "@playwright/test";
test("sign in, post a purchase, sell a strip, return and reconcile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Email address").fill(process.env.E2E_ADMIN_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Medicines", exact: true }).click();
  await page.getByRole("button", { name: "Add medicine", exact: true }).click();
  await page
    .getByLabel("Medicine name", { exact: true })
    .fill("Browser medicine " + Date.now());
  const name = await page
    .getByLabel("Medicine name", { exact: true })
    .inputValue();
  const barcode = "E2E-" + Date.now();
  await page.getByLabel("Barcode", { exact: true }).fill(barcode);
  await page.getByLabel("Default purchase cost / base").fill("2");
  await page.getByLabel("Sale price / base", { exact: true }).fill("5");
  await page
    .getByRole("button", { name: "Save medicine", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Medicine saved");
  await page.getByRole("button", { name: "Purchases", exact: true }).click();
  await page.getByRole("button", { name: "New purchase", exact: true }).click();
  await page
    .getByLabel("Supplier", { exact: true })
    .selectOption({ label: "Lahore Medical Distributors" });
  const invoiceRef = "BROWSER-" + Date.now();
  await page.getByLabel("Supplier invoice number").fill(invoiceRef);
  await page.getByRole("button", { name: "Add invoice line" }).click();
  await page
    .getByLabel("Medicine", { exact: true })
    .selectOption({ label: name + " " });
  await page.getByLabel("Batch", { exact: true }).fill("E2E-BATCH");
  await page.getByLabel("Expiry date", { exact: true }).fill("2030-12-31");
  await page.getByLabel("Unit", { exact: true }).selectOption("base");
  await page.getByLabel("Paid quantity").fill("100");
  await page.getByLabel("Cost per selected unit").fill("2");
  await page.getByLabel("Sale price / base unit").fill("5");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.getByRole("row").filter({ hasText: invoiceRef }).click();
  await page.getByRole("button", { name: "Confirm & post purchase" }).click();
  await expect(page.getByRole("status")).toContainText("Purchase posted");
  await page.getByRole("button", { name: "POS / Sales", exact: true }).click();
  await page.getByLabel("Scan barcode or search medicines").fill(barcode);
  await page.getByLabel("Scan barcode or search medicines").press("Enter");
  await page.getByLabel("Unit for " + name).selectOption("strip");
  await page.getByLabel("Cash received PKR").fill("100");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(
    page.getByRole("heading", { name: "Sale completed", exact: true }),
  ).toBeVisible();
  const link = page.getByRole("link", { name: "Open receipt / PDF" });
  const receipt = await page.request.get(
    (await link.getAttribute("href")) || "",
  );
  expect(receipt.headers()["content-type"]).toContain("application/pdf");
  expect((await receipt.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Sales history", exact: true })
    .click();
  await page.getByRole("row").filter({ hasText: "CASH" }).first().click();
  await page
    .getByRole("button", { name: "Return units", exact: true })
    .first()
    .click();
  await page.getByLabel("Quantity (base units)").fill("2");
  await page.getByLabel("Reason", { exact: true }).fill("Sealed returned pack");
  await page.getByLabel("Reference / credit note").fill("BROWSER-RETURN");
  await page.getByRole("button", { name: "Confirm return" }).click();
  await expect(page.getByRole("status")).toContainText("Return recorded");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "Reconcile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All balances match the ledger." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({ path: "test-results/inventory.png", fullPage: true });
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sales report" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Store & counter preferences" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("unauthenticated API rejected and protected routes stay protected", async ({
  request,
}) => {
  expect((await request.get("/api/inventory")).status()).toBe(401);
  expect((await request.post("/api/sales", { data: {} })).status()).toBe(401);
});

test("report exports, spreadsheet import, attachments and cashier API boundaries", async ({
  request,
  playwright,
}) => {
  const guard = { "X-Requested-With": "MedicalStore" };
  expect(
    (
      await request.post("/api/auth/login", {
        data: {
          email: process.env.E2E_ADMIN_EMAIL!,
          password: process.env.E2E_ADMIN_PASSWORD!,
        },
      })
    ).ok(),
  ).toBeTruthy();
  const stamp = Date.now();
  const created = await request.post("/api/medicines/import", {
    headers: guard,
    data: {
      rows: [
        {
          name: "API import " + stamp,
          salePrice: "5",
          purchasePrice: "2",
          barcode: "API-" + stamp,
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const medicines = await (
    await request.get("/api/medicines?q=API-" + stamp)
  ).json();
  const m = medicines[0];
  expect(m).toBeTruthy();
  const duplicate = await request.post("/api/medicines/import", {
    headers: guard,
    data: { rows: [{ name: "Atomic rollback " + stamp }, { name: m.name }] },
  });
  expect(duplicate.status()).toBe(409);
  expect(
    await (
      await request.get("/api/medicines?q=Atomic%20rollback%20" + stamp)
    ).json(),
  ).toHaveLength(0);
  for (const kind of [
    "sales",
    "purchases",
    "returns",
    "inventory",
    "movements",
    "profit",
    "medicineSales",
    "supplierPurchases",
    "daily",
    "inventorySummary",
    "lowStock",
    "outOfStock",
    "nearExpiry",
    "expired",
    "adjustments",
  ]) {
    const r = await request.get("/api/reports/export?kind=" + kind);
    expect(r.status(), kind).toBe(200);
  }
  const xlsx = await request.get(
    "/api/reports/export?kind=inventory&format=xlsx",
  );
  expect(xlsx.status()).toBe(200);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  const pdf = await request.get("/api/reports/export?kind=sales&format=pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  const supplier = await (await request.get("/api/suppliers")).json();
  const p = await (
    await request.post("/api/purchases", {
      headers: guard,
      data: {
        supplierId: supplier[0].id,
        supplierInvoice: "ATTACH-" + stamp,
        invoiceDate: "2026-11-01",
        receivingDate: "2026-11-01",
        lines: [
          {
            medicineId: m.id,
            batchNumber: "ATT",
            expiry: "2030-01-01",
            unit: "base",
            quantity: 1,
            unitCost: "2",
            sellingPrice: "5",
          },
        ],
      },
    })
  ).json();
  const bytes = Buffer.from("%PDF-1.4\nAttachment test");
  expect(
    (
      await request.post("/api/purchases/" + p.id + "/attachment", {
        headers: guard,
        data: {
          filename: "invoice.pdf",
          mime: "application/pdf",
          data: bytes.toString("base64"),
        },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    await (await request.get("/api/purchases/" + p.id + "/attachment")).body(),
  ).toEqual(bytes);
  const email = "cashier-" + stamp + "@example.com",
    password = crypto.randomUUID() + crypto.randomUUID();
  expect(
    (
      await request.post("/api/users", {
        headers: guard,
        data: { name: "API Cashier", email, password, role: "CASHIER" },
      })
    ).ok(),
  ).toBeTruthy();
  const cash = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3002",
  });
  expect(
    (await cash.post("/api/auth/login", { data: { email, password } })).ok(),
  ).toBeTruthy();
  const visible = await (await cash.get("/api/medicines")).json();
  expect(visible.length).toBeGreaterThan(0);
  for (const row of visible) {
    expect(row).not.toHaveProperty("purchasePrice");
    expect(row).not.toHaveProperty("batches");
  }
  for (const path of [
    "/inventory",
    "/reports",
    "/audit",
    "/users",
    "/suppliers",
  ])
    expect((await cash.get("/api" + path)).status(), path).toBe(403);
  expect(
    (
      await cash.put("/api/settings", {
        headers: guard,
        data: { storeName: "No" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await cash.post("/api/medicines", {
        headers: guard,
        data: { name: "No" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await cash.post("/api/sales", {
        headers: guard,
        data: {
          key: crypto.randomUUID(),
          lines: [{ medicineId: m.id, quantity: 1, unit: "base" }],
          discount: 1,
          payment: "CASH",
          tendered: 10,
        },
      })
    ).status(),
  ).toBe(400);
  await cash.dispose();
});
