# Sehat — Medical Store POS & Inventory

A database-backed single-store application for Pakistani pharmacies. React/TypeScript + Tailwind, shadcn-style Radix button primitives and Lucide; NestJS REST host; Prisma with the PostgreSQL driver adapter; PostgreSQL 16. Monetary operations use Decimal, persisted as NUMERIC. Currency is PKR; business dates use Asia/Karachi.

See [architecture and business rules](docs/ARCHITECTURE.md), [API](docs/API.md), and [deployment and recovery](docs/DEPLOYMENT.md).

For an existing installation at `F:\Sehat-MedicalStore`, use [the safe Windows update guide](docs/UPDATE-WINDOWS.md). Do not run first-time setup to update an existing database.

## Windows 11 installation

Start with [WINDOWS-INSTALL.md](WINDOWS-INSTALL.md). Install Docker Desktop, extract the ZIP, and double-click **Setup-Windows.cmd**. The included PowerShell helpers generate fresh local secrets, initialize PostgreSQL, prompt securely for an administrator and start the app at **http://localhost:3001**. PostgreSQL is not exposed on a host port. Use Start-Sehat, Stop-Sehat and Backup-Database for everyday operation.

The Compose configuration now runs **app + PostgreSQL + scheduled backups**. It preserves database records in a named Docker volume. The download contains no existing account, credentials, database dump, installed dependencies or build outputs. These are generated locally during setup.

## Start locally

Requires Node 24, npm, PostgreSQL 16 (with pg_trgm), and optionally Docker.

1. `cp .env.example .env`; set DATABASE_URL and a random JWT_SECRET of at least 32 characters.
2. For native development without the Windows helper, use a separately installed PostgreSQL database and put its connection URL in DATABASE_URL. The supplied Compose database is intentionally not published to the host; the Compose app reaches it internally. Do not expose it merely to run the native development workflow.
3. `npm ci`
4. `npm run db:migrate`
5. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12–72 UTF-8 bytes) in `.env`. Run `npm run db:seed`. Existing accounts are not silently reset. `npm run db:seed -- --demo` explicitly adds demonstration medicines and opening balances. Demo prices are illustrative, not official prices.
6. `npm run dev` starts the frontend on port 5173 and API on 3001. For the built application: `npm run build && npm start` serves the UI and API on port 3001.

No administrator or password from the Codex preview is included in the download. Create your own account using Setup-Windows or the native seed command. Do not commit `.env`.

Use the existing checkout in this isolated environment. No worktree is necessary. No environment publication or deployment is performed by these commands.

## Workflow

- **Medicines:** create/edit catalogue entries, barcode/generic/name search, company/category filters, inactive status, packaging and unit prices, stock history, XLSX export and CSV/XLSX import preview. Imports are atomic and reject duplicate records/barcodes. Search queries the API with debounce and trigram indexes; the initial catalogue/search result is bounded at 500 entries.
- **Purchases:** register suppliers, save/edit drafts, post once, review invoice lines, attach a PDF/JPEG/PNG of up to 1 MB to a draft, print/save PDF, and create linked supplier returns from inventory. Drafts do not change stock; posted invoices cannot be edited. Bonus quantities increase physical units without increasing the payable. Invoice discounts/charges are proportionally allocated to acquisition cost.
- **Inventory:** batch balances, box/strip/base-unit breakdowns, low-stock/expiry/restricted filters, immutable movement history, quarantine/recall status, opening entries or atomic spreadsheet imports, administrator adjustments, linked returns, and ledger reconciliation. The opening import template includes the medicine's database ID; preserve that ID. Existing balances are never overwritten.
- **POS:** name/generic/barcode search, keyboard scanner entry, F2 search, Enter to select, F8 complete, F9 open receipt, editable quantities and units, manager discounts, prescription references, cash/card/Raast/other, cash change, history, PDF receipts in 58/80 mm widths. A submitted cart is locked for safe retry. Check history before unlocking a request whose network outcome is uncertain. Payments record the chosen method; this is not a payment-gateway integration.
- **Returns:** linked to original allocations/purchase lines, bounded quantities, refunds using original revenue and batch cost, default customer-return quarantine, optional inspected sellable disposition. Quantities are always in base units. Returns and adjustments are append-only.
- **Reports:** date, medicine and purchase-supplier filters, net revenue/profit, purchases, current stock valuation, invoice rows, stock ledger and returns. CSV/XLSX/PDF exports use the same filters. Inventory is a current snapshot; the date range applies to transaction reports, not historical as-of stock. A medicine filter limits revenue and COGS to that medicine's lines and allocates purchase totals proportionally. The supplier filter applies to purchases, purchase returns, inventory and movements; sales are not supplier-filtered.
- **Settings:** store details, licence/footer, receipt width, invoice display prefix, warning horizon, default payment, users, roles, session invalidation and audit trail. Packaging ratios cannot change once stock/history exists. Prices are per base unit unless an explicit strip/box price is supplied; MRP is per base unit.

## Tests

Use a dedicated database whose name ends in `_test`. Tests add fixtures and never truncate your development database.

```sh
# Create medicalstore_test first; or set TEST_DATABASE_URL to a dedicated database.
# Configure your own separate test-database connection; never use your real store.
export TEST_DATABASE_URL="your-test-database-connection-URL"
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
npm test
npm run build
npm run test:e2e
```

`TEST_DATABASE_URL` is required by both suites; no database password is bundled. Browser tests use installed Chromium at `/usr/bin/chromium`; set CHROMIUM_PATH for a different installation. They start an isolated API on port 3002 and seed test-only credentials into the test database. Never use that database for real stock. Do not run the engine and browser suites concurrently because fault-injection tests temporarily install a failing trigger.

## Migrations and tooling

Prisma's JavaScript PostgreSQL adapter and query compiler avoid a required native-engine download. The initial SQL was generated with Prisma migrate diff. The installed Prisma 6 migration-deploy adapter hits an upstream PostgreSQL `name`-type deserialization failure; therefore `npm run db:migrate` uses `scripts/migrate.cjs`, a small PostgreSQL migration runner with an advisory lock, per-migration transactions, ordered SQL files, and SHA-256 verification of already-applied migrations. Do not switch between this migration history and `prisma migrate deploy`. Generate future SQL with `prisma migrate diff`, review it, add a new dated directory, then run the provided runner. Never edit an applied migration.

## Scope and remaining rollout work

The operational purchase → stock → sale → return → reconciliation path is implemented and tested: 31 PostgreSQL integration tests and 7 browser/API tests pass. The production build passes. A GitHub Actions workflow is included but has not been run remotely. This is an initial single-store release, not a claim of completed commercial rollout. Physical scanner/printer hardware, live multi-user store workload, production hosting, HTTPS, off-site backup delivery and restore drills on that host still need validation. Browser PDF printing uses the OS print dialog; silent ESC/POS/USB printing is not implemented.

Store logo receipts, medicine/unit defaults, supplier editing, opening business dates, expiry month normalization, preserved backend cashier discount limits (the Store Profile controls are hidden) and store-wide loose-sales policy are included. Report views cover invoice, daily, medicine, supplier, batch, low/out-of-stock, expiry, movement, adjustment and inventory reconciliation groupings. Role policies are deliberately limited to the three specified roles; administrators configure each account's role and the cashier discount limit. Historical as-of inventory snapshots and a general custom-role permission designer are outside this initial single-store scope.

The dependency audit has no high/critical findings after overrides; ExcelJS's legacy archiver/minimatch/uuid chain still reports moderate advisories. Its browser code is lazy-loaded. Evaluate an upstream update before production rollout; do not apply incompatible major overrides blindly. The application has not been published, pushed, or deployed.

## Branding and expiry update

The existing store name/logo drive sidebar, sign-in branding, tab title and receipts. Expiry Warning Days is a non-negative integer (zero is valid). Karachi calendar-day checks warn at the inclusive threshold, require per-batch acknowledgement before purchase/opening posting, and block normal stock entry for today/past dates. Overrides are audited; inventory badges update at midnight without changing balances. Purchase drafts remain saveable until issues are resolved. Default minimum stock and cashier discount limit fields are hidden; their stored values and backend controls remain intact.
