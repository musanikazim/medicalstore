# Modified and added files — 1.1.0

Backend changes:

- `server/api.ts`: enhanced routes/settings, readable references and shared report/receipt output.
- `server/engine.ts`: reorder/incomplete fields and import-only stock overlap guards.
- `server/finance.ts`: original effective dates on opening entries and optional customer email.
- `server/carts.ts`: operational validation for incomplete imported products.
- `server/printing.ts`: configured identity fallback.
- `server/seed.ts`: neutral fresh-store configuration without example contact details.
- New `server/statements.ts`, `server/business-printing.ts`, `server/business-routes.ts`, `server/imports.ts`, `server/demo.ts`.
- New `shared/business.ts`, `shared/imports.ts`, `shared/csv.ts`.
- `prisma/schema.prisma` and three new migration directories dated 20261103. Original migration SQL is unchanged.

Frontend changes:

- `web/main.tsx`, `web/spreadsheets.ts`.
- New `web/components/business.tsx`, `web/components/onboarding.tsx`, `web/screens/Suppliers.tsx`, `web/screens/Reorder.tsx`, `web/screens/DataImport.tsx`.
- Existing screens: Customers, CreditReports, Medicines, StoreSettings, ReturnForm, Reports, Purchases, Inventory and POS.

Release and verification changes:

- `package.json`, `package-lock.json`, `.gitignore`, `.dockerignore`.
- `scripts/windows/Setup.ps1`, `scripts/windows/Update.ps1`, `scripts/windows/Backup-Database.ps1`.
- New `scripts/windows/Reset-Development.ps1`, `Reset-Development-Installation.cmd`.
- `scripts/package-release.py`; new `scripts/verify-installation.ts`, `scripts/verify-printing.ts`.
- New `tests/business-release.test.ts`, `tests/browser/business-release.spec.ts`, `tests/windows-release.test.ps1`.
- Browser regression test portability/selectors: `tests/browser/branding-expiry.spec.ts`, `tests/browser/enhancements.spec.ts`.
- README, Windows install/update documentation, release/import/verification guides and the offline `docs/import-templates/Sehat-Import-Templates.xlsx` workbook.

No Git repository was created or initialized. Existing private configuration, backups, Docker volumes and running customer containers were not modified for development.
