/** Isolated release validation. Never accepts a normal customer database URL. */
import { Client } from "pg";
import { spawnSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
const root = process.env.TEST_DATABASE_URL;
if (!root || !new URL(root).pathname.endsWith("_test"))
  throw new Error("Set a dedicated TEST_DATABASE_URL ending in _test");
const url = new URL(root),
  maintenance = new URL(root);
maintenance.pathname = "/postgres";
const client = new Client({ connectionString: maintenance.toString() });
await client.connect();
const prefix = process.env.SEHAT_VALIDATION_PREFIX || "sehat";
if (!/^[a-z0-9_]{1,24}$/.test(prefix))
  throw new Error("Invalid validation prefix");
const names = [
  prefix + "_fresh_blank_test",
  prefix + "_fresh_demo_test",
  prefix + "_upgrade_test",
];
for (const name of names) {
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (exists.rowCount)
    throw new Error(
      "Validation database already exists; choose a new isolated test server. No reset performed: " +
        name,
    );
  await client.query(`CREATE DATABASE "${name}"`);
}
await client.end();
function run(file: string, args: string[], env: any) {
  const r = spawnSync(process.execPath, [file, ...args], {
    env: { ...process.env, ...env },
    stdio: "pipe",
    encoding: "utf8",
  });
  if (r.status !== 0)
    throw new Error(r.stderr || r.stdout || "Child process failed");
  return r.stdout;
}
for (const name of names) {
  const target = new URL(url);
  target.pathname = "/" + name;
  const env = {
    DATABASE_URL: target.toString(),
    SEED_ADMIN_EMAIL: "validation@example.com",
    SEED_ADMIN_PASSWORD: randomUUID(),
    ENABLE_BACKUPS: "false",
  };
  const c = new Client({ connectionString: target.toString() });
  await c.connect();
  if (name.endsWith("_upgrade_test")) {
    await c.query(
      'CREATE TABLE "_medicalstore_migrations" (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const dir of readdirSync("prisma/migrations")
      .filter((n) => /^\d/.test(n) && n < "20261103")
      .sort()) {
      const sql = readFileSync(
        `prisma/migrations/${dir}/migration.sql`,
        "utf8",
      );
      await c.query("BEGIN");
      await c.query(sql);
      await c.query(
        'INSERT INTO "_medicalstore_migrations" (name,checksum) VALUES ($1,$2)',
        [dir, createHash("sha256").update(sql).digest("hex")],
      );
      await c.query("COMMIT");
    }
    await c.query(
      `INSERT INTO "Customer" (id,name,mobile,"openingOutstanding","updatedAt") VALUES ('upgrade-customer','Preserved Customer','03001234567',125,now())`,
    );
    await c.query(
      `INSERT INTO "CustomerLedger" (id,"customerId",type,reference,debit,credit,"createdBy") VALUES ('upgrade-ledger','upgrade-customer','OPENING','Original opening',125,0,'legacy-admin')`,
    );
    await c.query(
      `INSERT INTO "Supplier" (id,name) VALUES ('upgrade-supplier','Preserved Supplier')`,
    );
    await c.query(
      `INSERT INTO "Settings" (id,data) VALUES ('store','{"storeName":"Preserved Brand"}')`,
    );
  }
  run("scripts/migrate.cjs", [], env);
  run("scripts/migrate.cjs", [], env);
  const demo = name.endsWith("_fresh_demo_test");
  run(
    "node_modules/tsx/dist/cli.mjs",
    ["server/seed.ts", ...(demo ? ["--demo"] : [])],
    env,
  );
  const counts = await c.query(
    `SELECT (SELECT count(*) FROM "Medicine")::int AS medicines,(SELECT count(*) FROM "Supplier")::int AS suppliers,(SELECT count(*) FROM "Sale")::int AS sales,(SELECT count(*) FROM "Collection")::int AS payments,(SELECT count(*) FROM "User" WHERE email='validation@example.com')::int AS admins`,
  );
  const data = counts.rows[0];
  if (data.admins !== 1 || data.sales !== 0 || data.payments !== 0)
    throw new Error("Unexpected fresh initialization counts");
  if (demo && data.medicines !== 4)
    throw new Error("Demo catalogue not loaded");
  if (!demo && data.medicines !== 0)
    throw new Error("Blank initialization created fake products");
  if (name.endsWith("_fresh_blank_test") && data.suppliers !== 0)
    throw new Error("Blank initialization created suppliers");
  if (name.endsWith("_upgrade_test")) {
    const preserved = await c.query(
      `SELECT c."openingOutstanding",s.data->>'storeName' AS brand FROM "Customer" c CROSS JOIN "Settings" s WHERE c.id='upgrade-customer' AND s.id='store'`,
    );
    if (
      preserved.rows[0]?.openingOutstanding !== "125.000000" ||
      preserved.rows[0]?.brand !== "Preserved Brand"
    )
      throw new Error("Upgrade did not preserve balances or branding");
  }
  await c.end();
  const server = spawn(
    process.execPath,
    ["--import", "tsx", "server/main.ts"],
    {
      env: {
        ...process.env,
        ...env,
        PORT: "3109",
        JWT_SECRET: "validation-only-secret-" + "a".repeat(48),
      },
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let n = 0; n < 60; n++) {
      try {
        const r = await fetch("http://127.0.0.1:3109/api/health");
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) throw new Error("Validation API did not start");
    const response = await fetch("http://127.0.0.1:3109/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "MedicalStore",
      },
      body: JSON.stringify({
        email: env.SEED_ADMIN_EMAIL,
        password: env.SEED_ADMIN_PASSWORD,
      }),
    });
    if (!response.ok) throw new Error("Administrator login failed");
    if (name.endsWith("_fresh_blank_test")) {
      const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
      const headers = {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-Requested-With": "MedicalStore",
      };
      const settings = (await (
        await fetch("http://127.0.0.1:3109/api/settings", { headers })
      ).json()) as any;
      if (settings.onboardingComplete !== false)
        throw new Error("Blank store onboarding was not offered");
      const choose = (confirm: boolean) =>
        fetch("http://127.0.0.1:3109/api/onboarding/demo", {
          method: "POST",
          headers,
          body: JSON.stringify({ confirm }),
        });
      if ((await choose(false)).status !== 400)
        throw new Error("Unconfirmed demo selection was accepted");
      if (!(await choose(true)).ok)
        throw new Error("Explicit empty-store demo onboarding failed");
      if ((await choose(true)).status !== 400)
        throw new Error("Nonempty-store demo safety guard failed");
    }
  } finally {
    server.kill();
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) return resolve();
      server.once("exit", () => resolve());
    });
  }
  console.log(
    `PASS ${name}: migrations, idempotency, ${demo ? "optional demo" : "no automatic demo"}, administrator login${name.includes("upgrade") ? ", preserved balance and branding" : ""}`,
  );
}
