# Sehat Medical Store 1.1.0

Release date: 3 November 2026. This is a complete standalone source/Docker package, not an incremental patch. No earlier ZIP is needed. The application remains a single-store installation; independent stores use separate installations and databases with their own configured identities.

## Included enhancements

- Date-filtered customer statements with opening, debit, credit, running and closing balances; original invoice references; expandable historical item details; summary and detailed PDFs.
- Shared branded A4, 80mm and 58mm document layouts. A4 tables repeat headings and have page numbering. Thermal business documents use content-sized continuous roll pages, segmented only at the PDF page-size limit. Sales invoices retain their existing thermal/A4 renderer and gain the common preview selector.
- Payment receipts, reversals, returns/refunds, credit adjustments, purchase documents, supplier/reorder lists and existing report exports use configured branding. Technical identifiers remain in the database/audit history and are hidden from normal report presentation.
- Authorized WhatsApp click-to-chat reminders from customer management, the ledger and the outstanding report. Current balances are fetched again before opening a conversation. English/Roman Urdu templates, editable previews, country code and shop contact are configurable. Sending remains manual; no delivery is recorded.
- Searchable Supplier Management, contact details, active status, purchase history and opening payable visibility.
- Sellable-stock reorder report with minimum/reorder/target levels, packaging conversions, filters, editable requirements and supplier-grouped purchase planning PDFs. These lists never post stock or create confirmed purchases.
- Administrator import module with worksheet selection, column mapping/profiles, templates, preview, duplicate policies, error downloads, partial success, persistent history and safe retries. See [DATA-IMPORT.md](DATA-IMPORT.md) for required fields and supported accounting modes.
- Fresh setup detection, optional demo choice, stronger verified backups, safe update workflow and a separately confirmed development-reset script.
- Blank fresh stores show an optional onboarding card for actual store identity and blank/demo/import choices. Demo loading requires an explicit request and refuses a nonempty store. Choosing an onboarding option saves the entered store identity.

## Database changes

The original eight migration directories are preserved. Three additive migrations are appended:

1. `20261103000000_business_release`: supplier contact/status/opening fields, medicine reorder/incomplete metadata, ImportJob, ImportRow, MappingProfile and HistoricalInvoice tables. Existing reorder levels initialize from each medicine's existing minimum stock. Existing quantities, invoices and financial entries are retained.
2. `20261103010000_customer_email`: optional customer email, default blank.
3. `20261103020000_history_guard`: append-only protection for imported historical invoices and supplier opening records.

Use the existing `npm run db:migrate` runner, which tracks checksums in `_medicalstore_migrations`, uses an advisory lock and applies each SQL migration transactionally. Do not use `prisma migrate deploy` or edit applied SQL. Normal updates never reset or reseed a database.

## Fresh Windows installation

1. Install/start Docker Desktop with Linux containers and WSL 2. The first build requires network access to Docker and npm registries.
2. Extract the complete ZIP into a new local folder. Keep it off OneDrive/network shares.
3. Run `Setup-Windows.cmd`. It checks Docker, existing-installation markers and port 3001; creates new local secrets; builds; migrates; offers demo data; asks for administrator credentials; verifies health; and opens the URL.
4. At **Do you want to load demo/sample data?**, Y loads optional demo medicines/stock; N or Enter leaves business records blank. Essential master configuration and administrator creation work in either mode.
5. Configure the actual store identity in Settings. Import existing records from the sidebar if needed, or start entering normal transactions.

If setup detects an existing `.env`, Sehat containers or Sehat volume, it stops and directs you to the updater. To recover an interrupted fresh setup, preserve `.env` and use Initialize-Database, Create-Administrator and Start; never generate different database credentials over an existing volume.

## Supported direct upgrades

The bundled migration chain supports the packaged 1.0.0 schema and earlier sequential prefixes of the original eight migrations, provided all applied files are unchanged and tracked by the existing custom runner. A direct upgrade from the complete eight-migration predecessor was exercised with preserved customer opening entries and store branding. Unknown/custom schemas, a different migration runner, renamed projects or manually edited SQL histories need a separate review.

Extract into a separate staging folder, then copy updated source into the existing installation **without deleting destination files or copying private configuration**. Preserve `.env`, backups, the existing database volume and installation identity. Follow [UPDATE-WINDOWS.md](UPDATE-WINDOWS.md).

Run `Update-Sehat.cmd` in the existing installation. It checks the existing volume and configuration, builds while the old application is available, pauses application writes, creates a PostgreSQL custom-format backup, checks `pg_restore --list`, verifies the copied SHA-256, and only then replaces the application. Startup applies pending compatible migrations. Sign in with the existing account. Demo data is never seeded during updates. If backup verification fails, replacement is aborted and the prior app is restarted.

Keep both the backup and a separate private copy of `.env`. If migration/startup fails, retain the error and backup and investigate before further changes. There is no automatic destructive rollback over a live database.

## Intentional development reset

`Reset-Development-Installation.cmd` is solely for an intentional disposable development installation. It displays the affected Sehat services and exact data volume, requires typing **RESET SEHAT**, pauses the app, creates/verifies a backup, then removes only the named Sehat project/volume. It archives the original `.env` and retains backups. Run Setup afterward to install fresh. It is never called by setup or update. It refuses noninteractive bypass and aborts before deletion if the confirmation, expected volume label or backup fails.

Do not run the reset against a customer installation. It permanently removes that installation's active database after the required backup and confirmation.

## Validation and limitations

Detailed executed checks and any release-time limitations are recorded in [VERIFICATION-1.1.0.md](VERIFICATION-1.1.0.md). Physical printer/scanner testing and a destructive reset against real customer data were not performed. Supplier ongoing payment accounting and stock-impacting historical sales remain unsupported as explained in the import guide. Thermal PDFs still depend on the printer driver supporting the requested custom roll size. Base PDF fonts support English/Roman Urdu; full Urdu-script font shaping is not included.

The standalone ZIP includes source, all migrations, Docker configuration, Windows launchers, configuration template, documentation, tests and offline Excel templates. It excludes this computer's `.env`, customer data, backup dumps, caches, installed dependencies and generated test results. Docker downloads dependencies/builds locally during installation; this is not an offline Docker-image bundle.
