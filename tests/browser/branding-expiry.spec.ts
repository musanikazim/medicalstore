import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { businessDate } from "../../shared/expiry";
const guard = { "X-Requested-With": "MedicalStore" };
const shift = (n: number) =>
  new Date(Date.parse(businessDate() + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
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
async function put(request: APIRequestContext, data: any) {
  const r = await request.put("/api/settings", { headers: guard, data });
  expect(r.ok()).toBeTruthy();
  return r.json();
}
async function medicine(request: APIRequestContext, prefix = "Browser expiry") {
  const r = await request.post("/api/medicines", {
    headers: guard,
    data: {
      name: prefix + " " + crypto.randomUUID(),
      salePrice: "10",
      purchasePrice: "2",
    },
  });
  expect(r.ok()).toBeTruthy();
  return r.json();
}
function pdfText(bytes: Buffer) {
  return [
    ...bytes
      .toString("latin1")
      .matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),
  ]
    .flatMap((m) => {
      try {
        return [
          ...inflateSync(Buffer.from(m[1], "latin1"))
            .toString()
            .matchAll(/<([a-fA-F0-9]+)>/g),
        ].map((t) => Buffer.from(t[1], "hex").toString("latin1"));
      } catch {
        return [];
      }
    })
    .join("");
}

test("branding updates immediately, survives logout/login/reload, prints name/logo, and hides only the requested controls", async ({
  page,
}) => {
  await login(page);
  const old = await (await page.request.get("/api/settings")).json();
  try {
    await put(page.request, {
      ...old,
      logo: "",
      defaultMinimumStock: 23,
      cashierDiscountPercent: 3,
    });
    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByLabel(/Default minimum stock/i)).toHaveCount(0);
    await expect(page.getByLabel(/Cashier discount limit/i)).toHaveCount(0);
    await expect(
      page.locator("aside").getByLabel("Default pharmacy icon"),
    ).toBeVisible();
    const long =
      "Al Shifa Medical and General Store Lahore Main Branch With A Very Long Configured Store Name";
    await page.getByLabel("Store name", { exact: true }).fill(long);
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(page.locator("aside .store-brand-name")).toHaveText(long);
    await expect(page).toHaveTitle(long + " POS");
    const width = await page
      .locator("aside .store-brand")
      .evaluate((e) => ({ client: e.clientWidth, scroll: e.scrollWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    await page.getByLabel("Store name", { exact: true }).fill("Royal Pharmacy");
    await page
      .getByLabel("Store logo (PNG/JPEG, up to 200 KB)")
      .setInputFiles(
        new URL("../fixtures/store-logo.png", import.meta.url).pathname,
      );
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(
      page.locator("aside").getByRole("img", { name: "Royal Pharmacy logo" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Royal Pharmacy POS");
    const persisted = await (await page.request.get("/api/settings")).json();
    expect(persisted.defaultMinimumStock).toBe(23);
    expect(persisted.cashierDiscountPercent).toBe(3);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveTitle("Royal Pharmacy POS");
    await page.reload();
    await expect(page).toHaveTitle("Royal Pharmacy POS");
    await login(page);
    await expect(page.locator("aside .store-brand-name")).toHaveText(
      "Royal Pharmacy",
    );
    const meds = await (
      await page.request.get("/api/medicines?q=Panadol")
    ).json();
    const m = meds.find((x: any) => x.name === "Panadol");
    const sale = await page.request.post("/api/sales", {
      headers: guard,
      data: {
        key: crypto.randomUUID(),
        lines: [{ medicineId: m.id, unit: "base", quantity: 1 }],
        discount: 0,
        payment: "CASH",
        tendered: 100,
      },
    });
    expect(sale.ok()).toBeTruthy();
    const id = (await sale.json()).id;
    const pdf = await (
      await page.request.get("/api/sales/" + id + "/receipt")
    ).body();
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(pdfText(pdf).replace(/\s/g, "")).toContain("RoyalPharmacy");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Remove logo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(
      page.locator("aside").getByLabel("Default pharmacy icon"),
    ).toBeVisible();
  } finally {
    await put(page.request, old);
  }
});

test("opening form validates all boundaries immediately, resets acknowledgement, and inventory filters update with the threshold", async ({
  page,
}) => {
  await login(page);
  const old = await (await page.request.get("/api/settings")).json();
  try {
    await put(page.request, { expiryDays: 10 });
    const m = await medicine(page.request);
    await page.reload();
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await page
      .getByRole("button", { name: "Opening stock", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Medicine", { exact: true }).selectOption(m.id);
    await dialog.getByLabel("Batch number", { exact: true }).fill("UI-EXPIRY");
    await dialog.getByLabel("Migration reference").fill(crypto.randomUUID());
    for (const n of [30, 15, 10, 5, 1]) {
      await dialog.getByLabel("Expiry", { exact: true }).fill(shift(n));
      const ack = dialog.getByRole("checkbox", {
        name: "Ignore Expiry Warning",
      });
      if (n > 10) {
        await expect(ack).toHaveCount(0);
        await expect(
          dialog.getByRole("button", { name: "Confirm opening stock" }),
        ).toBeEnabled();
      } else {
        await expect(
          dialog.getByText(`This medicine will expire in ${n} days.`, {
            exact: false,
          }),
        ).toBeVisible();
        await expect(ack).not.toBeChecked();
        await expect(
          dialog.getByRole("button", { name: "Confirm opening stock" }),
        ).toBeDisabled();
        await ack.check();
        await expect(
          dialog.getByRole("button", { name: "Confirm opening stock" }),
        ).toBeEnabled();
      }
    }
    await dialog
      .getByLabel("Batch number", { exact: true })
      .fill("UI-EXPIRY-CHANGED");
    await expect(
      dialog.getByRole("checkbox", { name: "Ignore Expiry Warning" }),
    ).not.toBeChecked();
    await dialog
      .getByRole("checkbox", { name: "Ignore Expiry Warning" })
      .check();
    const options = await dialog
      .getByLabel("Medicine", { exact: true })
      .locator("option")
      .evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    await dialog
      .getByLabel("Medicine", { exact: true })
      .selectOption(options.find((x) => x && x !== m.id)!);
    await expect(
      dialog.getByRole("checkbox", { name: "Ignore Expiry Warning" }),
    ).not.toBeChecked();
    await dialog.getByLabel("Medicine", { exact: true }).selectOption(m.id);
    for (const n of [0, -1]) {
      await dialog.getByLabel("Expiry", { exact: true }).fill(shift(n));
      await expect(
        dialog.getByRole("checkbox", { name: "Ignore Expiry Warning" }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Confirm opening stock" }),
      ).toBeDisabled();
      await expect(dialog.getByRole("alert")).toContainText("blocked");
    }
    await dialog.getByLabel("Expiry", { exact: true }).fill(shift(5));
    await dialog
      .getByRole("checkbox", { name: "Ignore Expiry Warning" })
      .check();
    await dialog.getByRole("button", { name: "Confirm opening stock" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByLabel("Search inventory").fill(m.name);
    await expect(
      page.getByText("Expiring in 5 days", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Stock filter").selectOption("Expiring Soon");
    await expect(page.getByText(m.name, { exact: true })).toBeVisible();
    await page.getByLabel("Stock filter").selectOption("Expired");
    await expect(page.getByText(m.name, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Expiry Warning Days").fill("0");
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Store settings updated",
    );
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await page.getByLabel("Search inventory").fill(m.name);
    await expect(page.getByText("Normal", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Expiring in 5 days", { exact: true }),
    ).toHaveCount(0);
    for (const invalid of [-1, 1.5])
      expect(
        (
          await page.request.put("/api/settings", {
            headers: guard,
            data: { expiryDays: invalid },
          })
        ).status(),
      ).toBe(400);
  } finally {
    await put(page.request, old);
  }
});

test("multi-line purchase posting requires independent acknowledgements, preserves failed draft and cannot be bypassed by API", async ({
  page,
}) => {
  await login(page);
  const old = await (await page.request.get("/api/settings")).json();
  try {
    await put(page.request, { expiryDays: 10 });
    const m = await medicine(page.request, "Multi expiry");
    const suppliers = await (await page.request.get("/api/suppliers")).json();
    const reference = "EXPIRY-" + crypto.randomUUID();
    const p = await (
      await page.request.post("/api/purchases", {
        headers: guard,
        data: {
          supplierId: suppliers[0].id,
          supplierInvoice: reference,
          invoiceDate: businessDate(),
          receivingDate: businessDate(),
          lines: [5, 10].map((d, i) => ({
            medicineId: m.id,
            batchNumber: "BATCH-" + i,
            expiry: shift(d),
            quantity: 10,
            unit: "base",
            unitCost: 2,
            sellingPrice: 10,
          })),
        },
      })
    ).json();
    expect(
      (
        await page.request.post("/api/purchases/" + p.id + "/post", {
          headers: guard,
          data: { key: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(400);
    await page.getByRole("button", { name: "Purchases", exact: true }).click();
    await page.getByLabel("Search purchases").fill(reference);
    await page.getByRole("row").filter({ hasText: reference }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("checkbox", { name: "Ignore Expiry Warning" }),
    ).toHaveCount(2);
    await expect(
      dialog.getByRole("button", { name: "Confirm & post purchase" }),
    ).toBeDisabled();
    await dialog
      .getByRole("checkbox", { name: "Ignore Expiry Warning" })
      .nth(0)
      .check();
    await expect(
      dialog.getByRole("button", { name: "Confirm & post purchase" }),
    ).toBeDisabled();
    await dialog
      .getByRole("checkbox", { name: "Ignore Expiry Warning" })
      .nth(1)
      .check();
    const request = page.waitForRequest(
      (r) =>
        r.url().endsWith("/purchases/" + p.id + "/post") &&
        r.method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "Confirm & post purchase" })
      .click();
    const payload = (await request).postDataJSON();
    await expect(dialog).not.toBeVisible();
    expect(
      (
        await page.request.post("/api/purchases/" + p.id + "/post", {
          headers: guard,
          data: payload,
        })
      ).ok(),
    ).toBeTruthy();
    const inventory = await (await page.request.get("/api/inventory")).json();
    expect(
      inventory
        .filter((b: any) => b.medicineId === m.id)
        .reduce((n: number, b: any) => n + b.quantity, 0),
    ).toBe(20);
    const audit = await (await page.request.get("/api/audit")).json();
    expect(
      audit.filter(
        (x: any) => x.entity === p.id && x.action === "EXPIRY_WARNING_OVERRIDE",
      ),
    ).toHaveLength(2);
    const expired = {
      key: crypto.randomUUID(),
      medicineId: m.id,
      batchNumber: "BAD",
      expiry: shift(-1),
      unit: "base",
      quantity: 1,
      unitCost: 2,
      reference: crypto.randomUUID(),
      ignoreExpiryWarning: true,
    };
    expect(
      (
        await page.request.post("/api/opening", {
          headers: guard,
          data: expired,
        })
      ).status(),
    ).toBe(400);
  } finally {
    await put(page.request, old);
  }
});

test("inventory advances expiry badges at Karachi midnight without changing quantities", async ({
  page,
}) => {
  await login(page);
  const old = await (await page.request.get("/api/settings")).json();
  try {
    await put(page.request, { expiryDays: 10 });
    const m = await medicine(page.request, "Midnight expiry");
    expect(
      (
        await page.request.post("/api/opening", {
          headers: guard,
          data: {
            key: crypto.randomUUID(),
            medicineId: m.id,
            batchNumber: "MIDNIGHT",
            expiry: shift(1),
            quantity: 7,
            unit: "base",
            unitCost: 2,
            reference: crypto.randomUUID(),
            ignoreExpiryWarning: true,
          },
        })
      ).ok(),
    ).toBeTruthy();
    await page.clock.install({
      time: new Date(businessDate() + "T18:59:59.000Z"),
    });
    await page.reload();
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await page.getByLabel("Search inventory").fill(m.name);
    await expect(
      page.getByText("Expiring in 1 days", { exact: true }),
    ).toBeVisible();
    await page.clock.fastForward(2000);
    await expect(
      page.getByText("Expires Today", { exact: true }),
    ).toBeVisible();
    const rows = await (await page.request.get("/api/inventory")).json();
    expect(rows.find((r: any) => r.medicineId === m.id).quantity).toBe(7);
  } finally {
    await put(page.request, old);
  }
});
