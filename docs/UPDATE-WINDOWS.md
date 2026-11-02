# Update an existing Windows store without deleting its data

Target installation: `F:\Sehat-MedicalStore`. This update keeps the same Docker project (`sehat-medicalstore`), the same PostgreSQL volume, and the existing `.env`. No fresh account or database reset is required. Do **not** run Setup-Windows for an update.

## Download and extract

Download the new **Sehat-MedicalStore-Complete.zip** into your Windows Downloads folder using that exact name. If your browser appends `(1)` to the name, rename the new download to `Sehat-MedicalStore-Complete.zip` first. The source ZIP does not contain your database, `.env`, passwords or backups.

Start Docker Desktop and wait until its Linux engine is running. Close other Sehat browser tabs before updating. Open a normal PowerShell window (administrator elevation is not required) and paste these commands:

```powershell
$ErrorActionPreference = 'Stop'
$SehatProject = 'F:\Sehat-MedicalStore'
$SehatZip = Join-Path $env:USERPROFILE 'Downloads\Sehat-MedicalStore-Complete.zip'
$SehatStaging = 'F:\Sehat-Update-20261102'

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

The updater checks that the existing database volume is present, creates a timestamped backup, builds the new image while your old app is still running, and recreates **only the app**. Startup applies the additive migration before accepting requests. The database and backup containers keep their existing volume/configuration. It then opens **http://localhost:3001**. Sign in with your **existing** account.

For a second attempt, reuse the already-extracted files and run `F:\Sehat-MedicalStore\Update-Sehat.cmd`. Do not repeat the extract block into the same staging folder; it deliberately refuses to overwrite it. If the image build fails, the old running app remains available; fix the stated issue and retry. The updater never deletes Docker volumes or business records.

## Changes in this update

- Sidebar and login branding use the existing store name/logo; the title is `[Store Name] POS`. Saving updates the UI immediately. The default pharmacy icon is used when no logo exists. Receipts use the same name and logo.
- Default Minimum Stock and Cashier Discount Limit controls are hidden. Their saved values, medicine thresholds and backend discount limits remain intact.
- Expiry Warning Days accepts non-negative whole calendar days, including zero, using the Asia/Karachi business date.
- Near-expiry purchase/opening lines require **Ignore Expiry Warning** before stock posting. Acknowledgement resets when medicine, batch or expiry changes. Purchase drafts remain saveable without increasing stock; blocked invoices remain drafts.
- Expiry today or earlier cannot be received as normal sellable stock, even with acknowledgement. Quarantined/restricted opening stock remains possible; a release to sellable stock follows the same entry checks.
- Expiry overrides record medicine name/ID, batch, expiry, remaining days, configured threshold, user, timestamp and source transaction in the existing audit table.
- Batch inventory has Normal / Expiring in N days / Expires Today / Expired indicators and an Expiring Soon filter. The filter includes today, which is not yet a past expiry date. Expired stock is separate. Warnings update at Karachi midnight and on refresh/settings changes; quantities do not change.
- Valid near-expiry sales remain allowed and show a warning. Existing FEFO, quarantine/recall exclusions, payments, prices and financial calculations are unchanged. Existing stock expiring today retains the prior end-of-day POS policy; this update blocks its **new normal stock entry**, not an otherwise valid sale under the existing policy.

## Migration and data safety

The only schema addition is `PurchaseLine.ignoreExpiryWarning`, defaulting to false. The new migration is `20261102000000_expiry_acknowledgement`. Previously applied migrations are byte-for-byte unchanged. No rows, balances, prices, users, settings or volumes are deleted or reset. Existing posted purchases stay posted; old drafts must meet the new posting checks.

Keep the `.dump` created in `F:\Sehat-MedicalStore\backups` and a separate private copy of `.env`. Never share `.env`, backups or rendered Docker configuration publicly. Do not use `docker compose down --volumes`, Docker factory reset, `/MIR`, `/PURGE` or volume deletion as part of this update.

The update has been tested on Linux with PostgreSQL, browser automation and Docker; Windows/WSL and your physical hardware are not available here. PowerShell syntax and the non-destructive command sequence are checked separately. See `docs/WINDOWS-PACKAGE-VERIFICATION.md` for the exact verification performed.
