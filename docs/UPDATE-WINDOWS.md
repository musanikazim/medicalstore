# Update an existing Windows store without deleting its data

Target installation: `F:\Sehat-MedicalStore`. This update keeps the same Docker project (`sehat-medicalstore`), the same PostgreSQL volume, and the existing `.env`. No fresh account or database reset is required. Do **not** run Setup-Windows for an update.

## Download and extract

Download the new **Sehat-MedicalStore-1.1.0-Complete.zip** into your Windows Downloads folder using that exact name. If your browser appends `(1)` to the name, rename the new download to `Sehat-MedicalStore-1.1.0-Complete.zip` first. The source ZIP does not contain your database, `.env`, passwords or backups.

Start Docker Desktop and wait until its Linux engine is running. Close other Sehat browser tabs before updating. Open a normal PowerShell window (administrator elevation is not required) and paste these commands:

```powershell
$ErrorActionPreference = 'Stop'
$SehatProject = 'F:\Sehat-MedicalStore'
$SehatZip = Join-Path $env:USERPROFILE 'Downloads\Sehat-MedicalStore-1.1.0-Complete.zip'
$SehatStaging = 'F:\Sehat-Update-1.1.0'

if (-not (Test-Path -LiteralPath $SehatZip)) { throw 'Updated ZIP not found in Downloads. Check the file name.' }
if (-not (Test-Path -LiteralPath (Join-Path $SehatProject '.env'))) { throw 'Existing .env not found. Check the installation path; do not run Setup.' }
if (Test-Path -LiteralPath $SehatStaging) { throw 'The staging folder already exists. Choose a new empty staging folder before continuing.' }

Unblock-File -LiteralPath $SehatZip
Expand-Archive -LiteralPath $SehatZip -DestinationPath $SehatStaging
$SehatSource = Join-Path $SehatStaging 'Sehat-MedicalStore'
if (-not (Test-Path -LiteralPath (Join-Path $SehatSource 'scripts\windows\Update.ps1'))) { throw 'This is not the updated Sehat package.' }

# Copy updated source only. /E does not delete destination files.
# Keep existing private settings, backups, Git files and installed/generated files.
& robocopy.exe $SehatSource $SehatProject /E /XD .git node_modules dist backups test-results playwright-report /XF .env *.dump *.zip /R:2 /W:1
if ($LASTEXITCODE -ge 8) { throw 'File copy failed. Read the robocopy message; do not continue.' }

Set-Location -LiteralPath $SehatProject
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Update.ps1
if ($LASTEXITCODE -ne 0) { throw 'Update did not finish. Keep the error message and your backup; no volume-removal command was run.' }
```

The updater checks that the existing database volume is present, builds the new image while your old app is still running, pauses application writes, creates a timestamped backup, verifies archive readability and the copied SHA-256, and recreates **only the app**. Startup applies the additive migration before accepting requests. The database and backup containers keep their existing volume/configuration. It then opens **http://localhost:3001**. Sign in with your **existing** account.

For a second attempt, reuse the already-extracted files and run `F:\Sehat-MedicalStore\Update-Sehat.cmd`. Do not repeat the extract block into the same staging folder; it deliberately refuses to overwrite it. If the image build fails, the old running app remains available; fix the stated issue and retry. The updater never deletes Docker volumes or business records.

## Release 1.1.0 additions

See [RELEASE-1.1.0.md](RELEASE-1.1.0.md) for statements, printing, reminders, supplier management, reordering, imports and the three additive 20261103 migrations. Existing stock quantities and financial history are preserved.

## Previously included changes

- Sidebar and login branding use the existing store name/logo; the title is `[Store Name] POS`. Saving updates the UI immediately. The default pharmacy icon is used when no logo exists. Receipts use the same name and logo.
- Default Minimum Stock and Cashier Discount Limit controls are hidden. Their saved values, medicine thresholds and backend discount limits remain intact.
- Expiry Warning Days accepts non-negative whole calendar days, including zero, using the Asia/Karachi business date.
- Near-expiry purchase/opening lines require **Ignore Expiry Warning** before stock posting. Acknowledgement resets when medicine, batch or expiry changes. Purchase drafts remain saveable without increasing stock; blocked invoices remain drafts.
- Expiry today or earlier cannot be received as normal sellable stock, even with acknowledgement. Quarantined/restricted opening stock remains possible; a release to sellable stock follows the same entry checks.
- Expiry overrides record medicine name/ID, batch, expiry, remaining days, configured threshold, user, timestamp and source transaction in the existing audit table.
- Batch inventory has Normal / Expiring in N days / Expires Today / Expired indicators and an Expiring Soon filter. The filter includes today, which is not yet a past expiry date. Expired stock is separate. Warnings update at Karachi midnight and on refresh/settings changes; quantities do not change.
- Valid near-expiry sales remain allowed and show a warning. Existing FEFO, quarantine/recall exclusions, payments, prices and financial calculations are unchanged. Existing stock expiring today retains the prior end-of-day POS policy; this update blocks its **new normal stock entry**, not an otherwise valid sale under the existing policy.

## Migration and data safety

This release also includes product types, master data, configurable units, serial tracking, POS drafts, split payments, customer credit, tax snapshots and print settings. It adds `20261102010000_products_credit_pos`, `20261102020000_barcode_tax` and `20261102030000_configurable_unit_defaults` after the expiry acknowledgement migration. Quantities move to six-decimal NUMERIC columns without changing their values. Existing product text/unit fields and posted snapshots are preserved. No business rows or volumes are reset. See [PRODUCTS-CREDIT-POS.md](PRODUCTS-CREDIT-POS.md) for the new workflows and accounting conventions.

Keep the `.dump` created in `F:\Sehat-MedicalStore\backups` and a separate private copy of `.env`. Never share `.env`, backups or rendered Docker configuration publicly. Do not use `docker compose down --volumes`, Docker factory reset, `/MIR`, `/PURGE` or volume deletion as part of this update.

Release 1.1.0 was validated locally on Windows with isolated PostgreSQL databases, browser automation and Docker image builds. Windows setup/update/reset command flow was tested with mocked Docker commands so no customer installation was changed. Physical printer/scanner and a destructive customer-store reset were not performed. See [VERIFICATION-1.1.0.md](VERIFICATION-1.1.0.md).
