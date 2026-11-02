import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb)
  throw new Error(
    "Set TEST_DATABASE_URL to a separate database ending in _test",
  );
process.env.E2E_ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ||
  "e2e-" + randomBytes(8).toString("hex") + "@example.com";
process.env.E2E_ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD || randomBytes(24).toString("hex");
if (!new URL(testDb).pathname.endsWith("_test"))
  throw new Error("E2E requires a dedicated _test database");
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3002",
    headless: true,
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : existsSync("/usr/bin/chromium")
          ? { executablePath: "/usr/bin/chromium" }
          : {}),
      args: ["--no-sandbox"],
    },
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run db:migrate && npm run db:seed -- --demo && npm start",
    url: "http://127.0.0.1:3002/api/health",
    reuseExistingServer: false,
    env: {
      DATABASE_URL: testDb,
      PORT: "3002",
      ENABLE_BACKUPS: "false",
      JWT_SECRET: randomBytes(48).toString("hex"),
      SEED_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL,
      SEED_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
    },
    timeout: 60000,
  },
  reporter: "list",
});
