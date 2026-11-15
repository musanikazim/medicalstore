# Release 1.1.0 verification

Executed locally on Windows on 3 November 2026 (Asia/Karachi). Customer containers on localhost:3001 and their PostgreSQL volume were not used for tests, restarted, migrated, reset or reseeded. The existing `.env` retained its original modification time. No cloud environment, clone or Git initialization was used.

## Completed checks

| Check | Executed result |
|---|---|
| TypeScript/build | `npm run build` passed: Prisma generation, TypeScript checking and Vite production build |
| Prisma schema | `prisma validate` passed |
| Original migrations | All eight original migration SHA-256 values match the original package manifest |
| Automated regression | 62 tests passed, zero failures, against a dedicated isolated PostgreSQL `_test` database |
| Browser regression | 14 distinct browser/API scenarios passed across the initial suite, targeted reruns and one final financial-document scenario |
| Financial documents | Sales invoice, payment receipt, reversal, return, refund, credit note, purchase and stock adjustment each returned a PDF in A4, 80mm and 58mm formats; reprinting retained sales counts and reconciled closing debt |
| Statements | Historical prices remain unchanged after product price edits; returns resolve their original item; original opening dates, date-filtered opening balance, collections and reversals reconcile |
| Reminders | Phone normalization, dynamic branding, unauthorized-role rejection and ledger balance after advances passed; no WhatsApp conversation was opened and no message was sent |
| Imports | Four minimal catalogue products with optional blanks, name/phone customers, name-only suppliers, opening balances, invalid stock staging, duplicate stock blocking, grouped records-only/stock-impacting purchases, safe retries and the unknown-price posting guard passed. Confirmed zero-cost products remain supported |
| Archive integrity | Database trigger rejects edits to imported historical originals |
| Fresh no-demo initialization | New isolated database migrated and seeded only essential configuration/administrator; no fake medicines, suppliers, sales or payments before an explicit later demo selection |
| Optional demo | Separate fresh demo initialization and explicit empty-store onboarding both passed; repeated/nonempty demo requests were refused |
| Upgrade | Reconstructed the previous eight-migration database, added original customer opening/ledger and branding fixtures, then applied all new migrations; 125.00 opening balance and original branding were preserved |
| Administrator login | Passed on fresh blank, demo and upgraded isolated databases |
| Backup/restore | PostgreSQL custom-format dump of the isolated upgrade database restored into a new test database; original 125.000000 opening balance was recovered |
| Windows helper behavior | 16 checks passed using copied scripts and mocked Docker commands in an isolated folder; checks cover existing-install detection, no-demo default, health flow, backup verification/order, preservation, failure aborts and exact reset targets |
| Windows configuration | Seven CRLF/LF/BOM/missing/duplicate-secret checks passed |
| PowerShell syntax | Nine Windows helper scripts parsed successfully |
| PDF layout | A4 and both thermal detailed statements rendered and visually inspected, including long names and 12 multi-item invoices. Continuous 58mm output was one 164.41 × 3078.16 point page, with totals and footer retained |
| Offline templates | All nine workbook tabs visually inspected; workbook reopened with the application's ExcelJS reader, all eight import worksheets mapped automatically, and the blank template created no import rows |
| Docker | Separate Node 24 validation image build, startup migration path, health, administrator login, demo catalogue, import API and built UI assets passed on isolated port 3108 without replacing the customer's running image/container |

The first browser run passed 10 of 13 cases. Three test-harness failures were corrected: a Windows file URL required `fileURLToPath`, a modal uses the accessible label “Close dialog”, and customer-row selection needed to target the customer cell after adding a reminder button. The three targeted reruns passed. An additional final case exercised the eight financial documents in all paper sizes and checked that printing did not repost transactions. No repeated full browser UAT was performed after minor edits.

All database fixtures lived in a separate `sehat-release-validation-20261103` PostgreSQL container using host port 55432. Test APIs used ports 3002/3109 and the Docker app smoke check used port 3108. Fresh/upgrade verification created new databases and explicitly refused to overwrite existing ones.

## Remaining practical limits

- Physical scanner/printer drivers, paper cutting, printer margins and long custom roll support require validation on the actual store hardware. Printing uses the browser/PDF viewer and OS driver; silent ESC/POS printing is not implemented.
- Windows reset command flow was tested with fake Docker commands. A destructive reset was not run against a real customer database or volume.
- Supplier ongoing payables/payment accounting is outside the existing model. The release supports audited supplier openings and labels them accordingly.
- Historical sales are records-only. Historical purchase tax is records-only because the operational purchase model does not have a tax column. Serialized or policy-override stock must use normal inventory/purchase entry.
- Catalogue storage defaults are explicitly marked incomplete; no unknown price creates a financial posting. Review imported operational details before selling.
- Standard PDF fonts support English/Roman Urdu; full Urdu-script shaping is not included.
- Dependency installation reports nine moderate advisories in the existing dependency graph. The Vite build warns about the lazy-loaded ExcelJS chunk size. These were not hidden with incompatible forced dependency upgrades.
- The Docker base image warns that OpenSSL detection is unavailable. Prisma uses the existing JavaScript PostgreSQL adapter/query compiler, and generation/build checks pass without a native engine.
- The complete ZIP is source plus installers, not a preloaded offline Docker image. First installation needs Docker/npm registry network access.

ZIP CRC/SHA-256 and credential-exclusion verification are performed by `scripts/package-release.py` when generating the versioned complete archive. The archive checksum is supplied next to the ZIP.
