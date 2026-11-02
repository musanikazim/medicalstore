# Windows package verification

Verified in the Codex environment on 2 November 2026 (Asia/Karachi):

- Docker image builds from a clean dependency install using package-lock.json.
- App runs as the unprivileged `node` user; startup applies checksum-verified database migrations.
- App + PostgreSQL + backup worker start from the packaged Compose configuration.
- The application host binding is loopback only. PostgreSQL has no host port mapping.
- A separate project/volume and port 3003 were used for verification so the existing preview on port 3001 was not changed. The supplied default remains `http://localhost:3001`.
- PowerShell 7.5.4 on Linux parsed the seven original helpers; the additional update helper also passed syntax checks. The official runtime's SHA-256 was checked against the official release checksum.
- Helper operations exercised: fresh cryptographic settings generation, repeat setup preserving settings, database initialization, administrator creation with hidden-password input simulated, optional sample data, startup/readiness, shutdown, restart with persisted data, and manual binary backup.
- Packaged HTTP login, medicine listing, POS sale and receipt PDF generation passed.
- The backup worker's PostgreSQL client wrote a binary dump. Restoring it into a separate empty database recovered four medicines and one sale.
- All 31 PostgreSQL tests and all 7 browser/API tests passed after the branding/expiry update. No frontend/backend business logic was changed for packaging.
- The release builder checks ZIP CRC integrity, required files, safe archive paths, per-file SHA-256 checksums, and exclusion of the current private configuration values.

The database, accounts, passwords, backup dumps, local `.env`, Git metadata, node_modules, generated build output, test results and caches are not included. `.env.example` has blank credential fields. Test credentials are generated at runtime, not bundled.

Windows 11, Windows PowerShell 5.1, Docker Desktop's WSL integration, Windows NTFS ACL handling and physical printer/scanner hardware are not available on this Linux host and were not directly tested. The scripts use Windows PowerShell 5.1-compatible syntax, and the Windows-only file-permission branch remains a platform-specific verification item. No remote CI run or public deployment was performed.

The dependency audit's existing moderate advisories and application scope are described in README.md. This ZIP packages the existing application; it does not claim that physical store rollout or every deployment-specific check has been completed.

## Branding/expiry update verification — 2 November 2026

- Production build and Docker image build passed.
- 31 PostgreSQL tests passed, including all 23 existing tests plus expiry boundaries, acknowledgements, audit content, atomic posting/imports, FEFO, and duplicate-request protection.
- 7 browser/API tests passed, including long branding, logo/fallback, immediate saves, logout/login/reload, receipt name/logo, removed controls, zero-day threshold, independent purchase warnings, and Karachi-midnight badges.
- The preview database was backed up before migration. Fingerprints and row counts of all 13 business/settings/account tables matched before/after the additive migration (excluding the new default-false column).
- The four previously applied migration files were checked byte-for-byte against the previous source ZIP and are unchanged.
- The PowerShell updater was executed on Linux against an isolated Docker installation running the previous version. It created a backup, built the update, automatically applied the new migration and recreated only the app. Existing accounts, profile/logo, quantities, costs and posted invoices were identical afterwards, and the existing authenticated session still worked. Branding persisted through the restart, and new near-expiry stock required acknowledgement.
- Windows 11/WSL/Windows PowerShell 5.1 were not directly available. The new updater passed PowerShell syntax checks; the Docker/PowerShell upgrade test used PowerShell 7.5.4 on Linux.

## Initial GitHub publication checks

The Windows `.env` validation fix in `scripts/windows/Common.ps1` reads individual lines instead of matching raw file text. Valid Windows CRLF files, Unix LF files, and UTF-8 BOM files are accepted without rewriting credentials. Missing, invalid and duplicate fields are rejected. The generated-secret format and existing passwords are unchanged.

For the initial publication, the filesystem-only PowerShell regression test, four standalone expiry-policy tests and production build were run. Database-writing suites were deliberately not rerun because publication was requested without modifying any database. Their preceding successful results are recorded above.

Database-free checks:

```sh
npx tsx --test tests/expiry-policy.test.ts
npm run build
```

PowerShell regression check (no Docker/database commands):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\windows-config.test.ps1
```
