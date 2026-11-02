# Products, POS drafts and customer credit

## Database upgrade

Run the existing migration runner (`npm run db:migrate`, or the Windows updater). New migrations are:

- `20261102010000_products_credit_pos`: normalized master data and backfilled legacy product links, NUMERIC(24,6) stock quantities and conversion snapshots, product packaging and serial identities, MRP snapshots, customers, bank accounts, split payments, immutable financial history, receivable projections and revision-controlled drafts.
- `20261102020000_barcode_tax`: supported barcode formats/checks and tax on return snapshots.
- `20261102030000_configurable_unit_defaults`: replace legacy unit-only checks with configurable product-unit defaults. The API checks the chosen default against that product's conversions inside the transaction.

Old migrations remain unchanged. These migrations neither reset tables nor delete stock/history. Quantities retain their original values when converted from integers. PostgreSQL JSON API responses retain numeric quantities; financial amounts remain decimal strings. Back up before upgrading. A rollback needs the matching previous application plus the private backup; do not run the old app against a partially upgraded database or manually remove migration records.

## Product and master data workflows

Administrators manage categories, dosage forms, product types, units and customer types in Settings. Names are unique without case sensitivity. Deactivate referenced records; deletion is allowed only when unused. Product Master can add a category or dosage form inline without discarding the form.

Choose a product type, category and base inventory unit. Pharmaceutical types require dosage form, batch and expiry. Non-pharmaceutical fields include brand, specification, model and warranty; pharmaceutical-only fields are hidden for these types. Barcode is optional; each product always has an internal code, searchable as its number, `MED-number` or `PROD-number`. Supported barcode formats are printable Code 128 input, EAN-13, EAN-8 and UPC-A with check-digit validation. Existing unique-barcode protection also covers inactive products.

Legacy base/strip/box packaging is preserved. Additional conversions specify the number of base units in one package, an optional package price, and whether a fractional selected package is allowed. Choose configured default purchase/selling units. Product and selected unit must both allow fractional quantities; serial-controlled stock is always integral. Tracking and conversion factors cannot change after inventory history exists. Prices can change. Rename a unit carefully: posted documents keep their original unit labels.

Batch and expiry tracking can be disabled for eligible non-pharmaceutical products before they have stock. Missing lot numbers receive internal lot IDs. No-expiry stock uses an internal `9999-12-31` sentinel; inventory displays “Not applicable.” Required pharmaceutical controls cannot be switched off. Supply received serial numbers for serial-tracked stock, select exact serials at checkout, and specify exact serials on returns/adjustments. Serial stock status follows batch restrictions.

Purchase entries store base-unit MRP on the line and received batch. Product, purchase and POS pricing above MRP remains permitted with a visible warning and audit record. The warning is not a price-compliance approval.

## Checkout and recovery

Use **Add split payment** for one or more cash/card/transfer/credit/advance allocations. Allocations must equal the tax-inclusive invoice total. Cash tendered may exceed its allocation and produces change. Transfers require an active bank account and reference and remain operator-recorded; there is no external bank verification integration. Never enter a full card number or CVV in any field.

Select a customer for credit/advance. Quick customer creation preserves the cart; a cashier may create a basic non-credit customer, while a manager/administrator approves credit and sets limits. Limits apply to current gross debt, with customer advances displayed separately.

Changes save automatically to the database after a short debounce. The browser also retains a per-user recovery copy; wait for “Saved to store database” before closing the browser where possible. Navigation/refresh offers Resume Draft, Discard Draft and Start New Sale. “Resume database version” is available when another window changed the draft. Conflicting versions are rejected rather than overwritten. Starting a new sale leaves other held drafts available. Hold Sale saves a named/numbered draft and clears the counter. Each cashier owns their drafts; another cashier cannot modify them. Held carts do not reserve or deduct stock.

Resuming preserves the cart and lists item-specific stock, price, prescription, serial and unit problems. Accept a changed price explicitly or correct/remove the affected row. Authorized users can open Product Master to correct a product, then return and resume. Checkout repeats validation within the stock transaction. Expired/recalled/quarantined stock cannot be sold. Submitted requests retain an idempotency key for safe retries, and posted drafts close atomically with the sale.

## Customer accounting

A **debit increases the customer's net debt**; a **credit reduces it**. Immutable ledger entries are ordered by a database sequence. Customer net balance equals gross outstanding minus explicit advances. Gross outstanding includes authorized opening debt plus each invoice's original credit minus settlements and credit-return reductions. A customer account with transactions is deactivated, not deleted.

Collections allocate to opening debt and then oldest unpaid invoices by default. Manual allocation allows partial payment across chosen invoices. The total cannot exceed received funds or invoice debt; excess becomes a separate advance only after explicit consent. Duplicate requests use idempotency keys and do not create another receipt. Advance checkout decreases the advance and records the corresponding debit without creating another cash receipt.

Credit returns reduce the original invoice's remaining debt first. Any returned paid portion becomes a cash/card/transfer refund or an explicitly selected customer advance. Original invoice allocations prevent duplicate/over-quantity returns. Manager/administrator credit notes reduce debt with a reason and audit trail. Administrators reverse collections by posting compensating records and restoring allocations; original history is never edited. An already-used collection advance cannot be reversed until its dependent allocations are corrected.

Customer screens show purchase history, ledger, receipts, invoice status and outstanding amounts. Financial APIs and the database protect append-only collections, settlements, reversals, credit notes and ledger rows.

## Reporting and printing

Revenue and gross profit use sales/returns excluding tax and actual batch COGS. Customer collections never create revenue. Payment reconciliation separates invoice allocations, later collections, reversals and refunds by method; credit and advance movements are explicitly classified as non-cash. Transfer values are operator-entered.

Customer statements, credit sales, collections, customer sales and reconciliation use Karachi posting-date filters. Outstanding, overdue and aging reconstruct the balance through the selected end date from immutable ledger entries and original allocations, including subsequent reversals and advances. Aging compares invoice due dates with that end date. Opening debt without an original due date is shown in the oldest aging bucket. Export these tables to XLSX or PDF, and print customer statements/collection receipts.

Dashboard purchase-cost valuation covers all current physical stock at actual batch cost. Potential selling value covers available sellable, unexpired stock at current base-unit selling prices; it is an estimate before package discounts and tax. Credit KPIs identify today's credit sales/collections separately from current total outstanding.

Invoice PDFs support 58 mm, 80 mm and A4, configured under Invoice & Printing. Preview or print/reprint from the original invoice. Reprinting never assigns a new number. PDFs include store branding, customer/cashier snapshots, unit/price/discount totals, tax, paid-at-sale amount, current invoice debt, cash change, payment methods, optional batch details and configured policy/notes. A4 repeats table headings after page breaks. Browser/OS printing controls and physical printer settings remain the operator's responsibility.

## Verification scope

Use a separate database whose name ends `_test` for `npm test` and `npm run test:e2e`. The tests refuse a normal store database. Never run demo seeding or integration tests against a real Windows store. See ENHANCEMENT-VERIFICATION.md for release verification and limitations.
