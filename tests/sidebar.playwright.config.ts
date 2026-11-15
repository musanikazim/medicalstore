import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
// Layout-only checks: API fixtures are intercepted, with no database or seed.
export default defineConfig({
  testDir: "browser",
  testMatch: "sidebar.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4173", headless: true, hasTouch: true },
  webServer: {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    command: "npx vite --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
