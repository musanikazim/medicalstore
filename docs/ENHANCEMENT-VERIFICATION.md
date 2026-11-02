# Enhancement verification — 2 November 2026

## Automated application checks

- Production build passes with Prisma client generation, strict TypeScript checking and Vite compilation.
- PostgreSQL integration/policy suite: 52 tests, covering the original stock/FEFO/return/expiry rules plus normalized master data, optional/check-digit barcodes, pharmaceutical safeguards, custom conversions, fractional stock, MRP audits, split payment, transfer references, card last-four validation, credit limits, partial/manual settlement, advances, credit returns, credit notes, reversals, append-only history, draft ownership/revision/revalidation, serial lifecycle, tax/revenue reconciliation, as-of balances and all PDF formats. Concurrent duplicate collections and competing credit sales are explicitly tested.
- Browser/API suite: 10 tests covering the original workflows and branding/expiry controls plus inline category/dosage creation, preserved forms, no-barcode products, MRP warnings, cart navigation/refresh recovery, multiple held drafts, price-change acknowledgement, customer credit approval, mixed cash/credit checkout, partial collection and 58/80/A4 reprints.
- PowerShell configuration regression passes CRLF, LF, UTF-8 BOM, unchanged file bytes, missing/invalid/duplicate setting checks. All Windows scripts parse using PowerShell 7 on Linux; the Windows password-validation fix remains included.

Tests use only dedicated test databases. No test reset, demo seeding, financial test posting or enhancement migration was performed against the original store database.

## Migration preservation

The original preview database was backed up privately and restored into `sehat_upgrade_test`. All three enhancement migrations applied successfully. Comparing every original column in all 16 existing tables confirmed unchanged values and row counts, including stock, costs, posted purchase state, users and settings. Comparison normalizes PostgreSQL integer/NUMERIC representations while retaining numeric values. Backup and hashes remain outside Git and the source ZIP.

A second test used an isolated Docker Compose project, the prior application image and synthetic legacy purchase/sale/payment/return records. The Windows updater was executed using PowerShell on Linux, with only test project/volume names and paths substituted in a temporary script copy. It backed up first, built the new image, recreated only the app and applied migrations automatically. The backup was restored into another isolated database and every original column compared with the upgraded database. Original posted history, account hash, stock movements, allocation cost and quantities matched. The preserved account logged in afterwards, migrated APIs/reports responded successfully, and all three invoice PDFs reprinted successfully.

The original store database and its persistent volume were not upgraded or reset. The development branch is intended for review before an existing Windows store runs the documented updater.

## Docker and package checks

The Docker image builds with the optional trusted proxy CA secret. It runs as the unprivileged node user. Verification uses a separate named database volume, a loopback-only app port, no published database port and separate private generated credentials. The package includes source, all migrations, Docker/Windows scripts, docs and tests; it excludes `.env`, credentials, backup/database files, dependencies, Git metadata and generated build/test output. The packager checks paths, required files, SHA-256 manifests and actual private configuration values before writing the ZIP.

## Practical limitations

Windows 11, Windows PowerShell 5.1, Docker Desktop/WSL integration, NTFS ACL handling and physical printer/scanner hardware are not available on this Linux host and are not claimed as directly tested. Browser PDF preview/printing is supported; printer paper/margins need local configuration. Bank transfers are operator-recorded without external verification. MRP warnings are not legal price-compliance approval. Selling inventory value is a current base-unit estimate before packaging discounts/tax. Financial statements use Karachi posting dates; opening debt with no historical due date is placed in the oldest aging bucket.

The production bundle retains the existing large ExcelJS export chunk warning; it is lazy-loaded. Prisma emits an OpenSSL-detection warning in the slim Docker build, but the configured JavaScript engine with PostgreSQL adapter builds and runs successfully.
