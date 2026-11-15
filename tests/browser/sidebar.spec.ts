import { test, expect } from "@playwright/test";
test.use({ hasTouch: true });
const sizes = [
  { name: "desktop", width: 1920, height: 1080 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "short desktop", width: 1280, height: 600 },
  { name: "small screen", width: 1024, height: 480 },
  { name: "150% zoom effective viewport", width: 853, height: 480 },
  { name: "200% zoom effective viewport", width: 640, height: 360 },
  { name: "portrait touch", width: 390, height: 600 },
  { name: "landscape touch", width: 844, height: 240 },
];
for (const size of sizes)
  test(`sidebar scroll and fixed branding: ${size.name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const data =
        path === "/api/auth/me"
          ? {
              id: "layout-admin",
              name: "Layout Admin",
              role: "ADMIN",
              email: "layout@example.com",
            }
          : ["/api/settings", "/api/branding"].includes(path)
            ? { storeName: "Sidebar layout test", onboardingComplete: true }
            : path === "/api/reports"
              ? null
              : [];
      await route.fulfill({ json: data });
    });
    const nav = page.getByRole("navigation", { name: "Workspace navigation" });
    for (const collapsed of [false, true]) {
      // Independent input-device checks start with a fresh document, so a
      // synthetic touchscreen gesture cannot leave a compositor fling active.
      await page.goto("/");
      await expect(nav.getByRole("button")).toHaveCount(11);
      if (collapsed)
        await page.locator("aside .sidebar-bottom > button").click();
      const logo = await page.locator("aside .brand").boundingBox();
      // Check normal document scrolling before starting any sidebar gestures.
      await page.locator("main").evaluate((el) => {
        const filler = document.createElement("div");
        filler.id = "layout-scroll-fixture";
        filler.style.height = "2000px";
        el.append(filler);
      });
      await page.mouse.move(size.width - 30, size.height / 2);
      await page.mouse.wheel(0, 400);
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(0);
      expect(await nav.evaluate((el) => el.scrollTop)).toBe(0);
      expect((await page.locator("aside .brand").boundingBox())!.y).toBe(
        logo!.y,
      );
      await page
        .locator("#layout-scroll-fixture")
        .evaluate((el) => el.remove());
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      const box = await nav.boundingBox();
      expect(box!.height).toBeGreaterThan(20);
      if (await nav.evaluate((el) => el.scrollHeight > el.clientHeight + 1)) {
        await page.mouse.move(
          box!.x + box!.width / 2,
          box!.y + box!.height / 2,
        );
        await page.mouse.wheel(0, 300);
        await expect
          .poll(() => nav.evaluate((el) => el.scrollTop))
          .toBeGreaterThan(0);
        await nav.evaluate((el) => (el.scrollTop = 0));
        await page.mouse.wheel(0, 30);
        await expect
          .poll(() => nav.evaluate((el) => el.scrollTop))
          .toBeGreaterThan(0);
        await nav.evaluate((el) => (el.scrollTop = 0));
        const cdp = await page.context().newCDPSession(page),
          x = box!.x + box!.width / 2,
          start = box!.y + box!.height - 8,
          end = Math.max(box!.y + 8, start - 100);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y: start }],
        });
        for (let n = 1; n <= 8; n++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: start + ((end - start) * n) / 8 }],
          });
          await page.waitForTimeout(16);
        }
        await page.waitForTimeout(250);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect
          .poll(() => nav.evaluate((el) => el.scrollTop))
          .toBeGreaterThan(0);
        await cdp.detach();
      }
      await nav.evaluate((el) => (el.scrollTop = el.scrollHeight));
      const bottom = await nav
        .getByTitle("Settings", { exact: true })
        .boundingBox();
      expect(bottom!.y).toBeGreaterThanOrEqual(box!.y - 1);
      expect(bottom!.y + bottom!.height).toBeLessThanOrEqual(
        box!.y + box!.height + 1,
      );
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect((await page.locator("aside .brand").boundingBox())!.y).toBe(
        logo!.y,
      );
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(80);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
    await nav.getByTitle("Settings", { exact: true }).click();
    await expect(page.locator("main h1")).toHaveText("Settings");
  });
