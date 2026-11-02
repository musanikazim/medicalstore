# Architecture and implementation plan

React + TypeScript SPA → NestJS REST API → Prisma → PostgreSQL. One store, one currency (PKR), Asia/Karachi business dates. Frontend is an operator client; all authorization and inventory validation occurs on the server.

## Database

Users have administrator, manager or cashier roles. Medicine records own immutable-after-use packaging ratios and default prices. Suppliers own purchase invoices. Purchases have normalized lines; posted lines create inventory batches with exact acquisition costs. Sales have normalized lines, batch allocations and payments. Returns link to original lines and allocations. Adjustments and openings generate stock movements. The append-only movement ledger is authoritative and batch balances are checked against it. Audit records identify every writer. A settings record stores store/receipt preferences. Numeric monetary columns use six decimal places internally and two at invoice boundaries.

## Transaction rules

Every stock mutation takes the same PostgreSQL transaction advisory lock and executes in a serializable transaction. Retry serialization/deadlock conflicts, then reject cleanly. This deliberately prioritizes correctness for a single counter/store over write throughput. Unique idempotency keys plus payload hashes protect retried purchases, sales, returns and adjustments. FEFO orders by expiry, then batch ID; expired, recalled and quarantined stock is excluded. Expiry dates are inclusive through the stated Karachi date; month-only labels resolve to the month's last day. Batch costs include invoice charges/discounts allocated proportionally by net line value (equal allocation when all values are zero), divided over paid plus bonus base units. Final-line residual allocation preserves exact invoice totals. COGS follows actual consumed batches. Prices and conversion factors are copied to transaction lines.

Sales returns default to quarantine; only authorized inspected returns can be sellable. Return counters prevent returning more than the original quantity. Posted records cannot be edited or deleted. A new return or adjustment is required. Cashier routes omit costs and profit and deny stock-writing/report/settings endpoints.

## Screens and stages

1. Login, session, application shell, user permissions, schema and migrations.
2. Medicines, suppliers, packaging, purchase drafts/posting, opening stock.
3. Batch inventory, ledger, expiry and stock alerts.
4. Keyboard POS, FEFO sales, cash/card/Raast, history and receipts.
5. Linked returns, adjustments, reports, CSV/XLSX/PDF exports and settings.
6. Critical transaction integration tests, build, smoke checks, backup/restore and deployment instructions.

Validation uses real PostgreSQL, including simultaneous last-item sales, replayed requests, rollback, expired stock rejection, packaging and cost accounting. Browser print supports thermal widths and system PDF; the API also generates PDF invoices. Scanner input uses keyboard events, requiring no proprietary device driver.
