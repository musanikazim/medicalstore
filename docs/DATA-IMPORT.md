# Data Import & Migration — release 1.1.0

Administrators open **Data Import & Migration** in the sidebar. Managers and cashiers cannot import. Use the included `import-templates/Sehat-Import-Templates.xlsx` workbook or download an individual template from the application. The workbook has eight import worksheets and an Instructions worksheet. Brown headings identify required fields; product code and product name are alternatives when identifying opening stock.

## Recommended order

1. Configure the actual store name, address, phone and logo in Settings.
2. Import Medicine Catalogue.
3. Import Suppliers and Customers.
4. Import Opening Inventory.
5. Import Customer Balances and Supplier Balances, where needed.
6. Import optional historical records.

Starting with a blank store is valid. Imports can be performed later. Fresh Windows setup separately offers optional demonstration data; existing updates never run demo seeding.

A blank fresh store also offers optional onboarding on the Dashboard: save the actual store identity, start blank/skip, load demo records into the empty store, or open the import module. Existing installations are not forced through onboarding. Reminder balances reconcile to the customer ledger after advances; a net credit balance does not enable a payment reminder.

## Three steps

**Upload:** choose the import type and an `.xlsx` or UTF-8 comma-separated `.csv` file. Maximum file size is 2 MB and maximum batch size is 2,000 rows. Select the intended Excel worksheet; the first row must contain unique, nonempty column headings. CSV supports quoted commas, escaped quotes and multiline remarks.

**Preview:** inspect the proposed column mappings. Each source column can map to one system field or be ignored. A system field may be mapped only once. Common names such as Product, Type, Qty, Retail and Exp are suggested. Review all financial mappings yourself. Save reusable mapping profiles by name. Dates support YYYY-MM-DD, DD/MM/YYYY and Excel dates; expiry months resolve to month end. Numbers support thousands separators and up to six decimals. Keep phone numbers and barcodes as text.

Review total, valid, invalid, duplicate, proposed-new and proposed-update counts. Download the error workbook for missing fields and validation failures. Invalid stock rows remain in the saved preview as incomplete staging records. They do not create batches. Correct their source data and upload a corrected file.

**Confirm:** only eligible rows are processed. Unrelated invalid rows do not block valid rows. All lines of a historical invoice are treated as one group; one invalid invoice line blocks that whole invoice. The result shows successful, skipped and failed counts. Import history can reopen a job and safely retry failures. Successful rows use persistent idempotency keys and are not posted again. Re-uploading identical rows with identical options returns the original job, even if the filename changed.

## Medicine catalogue

Only **Medicine Name** and **Category** are required. Generic, manufacturer, form, strength, brand, barcode, purchase/selling prices, MRP, units, packaging ratios and stock thresholds are optional. The four-row example with Panadol, Augmentin, Brufen Syrup and Disprin works even with blank optional prices and quantity.

Catalogue imports do not post inventory, even when source quantity, batch, expiry or supplier columns are supplied. Those source values remain in import history for reference; use the separate opening-stock import to establish stock.

Categories match case-insensitively with repeated spaces removed for matching. Enable **Confirm creation of missing categories** to create new categories. Missing categories otherwise produce preview errors. Names remain editable database master records.

The existing non-null medicine schema requires storage defaults: unknown default prices use zero internally, form/unit use the existing Tablet/tablet defaults and packaging ratios retain the existing 10/10 defaults. These are explicitly marked in `incompleteFields`, not treated as verified commercial values. No financial transaction or stock entry is created by the catalogue import. **Incomplete Product Details** in Medicine Management locates these records. Complete and verify operational details there before selling. POS blocks unknown sale price/form/base-unit details and unknown packaging ratios when a non-base unit is selected. An unknown default purchase price alone does not block a sale of stock whose actual cost was recorded at receipt. Optional MRP remains null.

Purchases and opening stock refuse a zero cost when the product's purchase cost is still marked unknown. Enter the actual received cost, or explicitly verify a genuine zero-cost product in Medicine Management first. Catalogue updates retain confirmed existing zero values; omission of a field does not relabel a confirmed zero as unknown.

Minimum Stock and Reorder Level are base-unit thresholds. Target Stock is the existing `reorderQuantity` setting, now used by the dedicated reorder report as the desired base-unit balance. Existing configured values are retained.

Duplicate matching uses barcode and normalized name plus available strength, manufacturer, brand, dosage form and base-unit information. Ambiguous variants require manual review; different strengths or brands are not automatically merged. Choose Review, Skip or Update. Updates retain omitted fields and cannot change packaging conversions after stock/history exists. Review the identifier and variant carefully before authorizing updates.

## Customers and suppliers

Customers require **Customer Name** and **Contact Number** only. Address, email, notes and opening outstanding are optional. Pakistani mobile formats such as `03001234567`, `923001234567` and `+92 300 1234567` normalize to `923001234567`. Phone cells remain text. Reminders separately require a valid mobile and positive current outstanding.

Suppliers require **Supplier Name** only. Contact person, mobile, address, email, remarks and opening payable are optional. Supplier updates preserve existing purchase relationships. Existing master records are never deleted by an import.

Opening customer balances create auditable OPENING ledger entries, never fake sales. Separate opening-balance imports require an original date and business reference and are allowed only when the customer ledger is empty. Existing balances cannot be overwritten by a master-record update. Use the established collection, reversal and credit-note workflows for subsequent financial events.

Supplier opening balances are separate audited opening records, never fake purchase invoices. Supplier payments and ongoing payable accounting are not implemented by the existing accounting model. The supplier screen explicitly labels **Opening payable**, rather than claiming a calculated current balance. Supplier openings cannot be silently replaced.

## Opening inventory

Identify a product with its database ID, Product Code or an unambiguous exact medicine name. Supply positive quantity, a configured packaging unit, actual purchase cost, original opening date and a business reference. Tracked products also require a real batch and expiry. Multiple different batches per medicine are supported. Serialized devices must use Inventory with explicit serial numbers. Unknown stock data is staged as invalid; no batch, expiry, price or quantity is fabricated for tracked inventory.

The importer uses the existing atomic opening-stock engine and creates stock movements and audits. A repeated product/batch opening is rejected, even if a new file uses a different reference. Expired entries and near-expiry entries requiring an acknowledgement must be entered through the existing Inventory workflow with its explicit policy controls. Imports cannot bypass expiry safeguards.

## Historical purchases and sales

**Historical records only** stores an immutable archive of the original imported details. It does not alter current stock, receivables, supplier opening balances, operational sales reports or purchase totals. Imported history is visible in the archive at the bottom of the import screen.

Repeat supplier/customer, original invoice number, date and whole-invoice total on each item row. Products and parties must map unambiguously. Supply quantities, units and original prices. The sum of quantity × price − line discount + line tax must equal the invoice total to two decimals. Tax/discount columns are line amounts, not percentages. Missing critical values, inconsistent totals and duplicate invoices are rejected.

**Stock-impacting purchases** uses the existing draft/post purchase engine, with an explicit confirmation checkbox. It requires valid stock identity, costs and selling prices and does not support purchase tax because the current purchase model has no tax field. Enter taxed historical invoices as records-only. Opening stock for the same product/batch blocks stock-impacting history to prevent counting inventory twice. Conversely, an opening import refuses an already-existing batch. Purchasing a new delivery of a previously used lot should use the normal operational Purchase workflow, not the migration importer.

Historical sales are records-only. Automatically replaying old sales against today's batches or receivables would be unsafe and is deliberately unsupported. Use customer opening balances to establish migrated debt.

Retain the original source files and preview/error reports as part of the store's migration records. No import deletes existing business records.
