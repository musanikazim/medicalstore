# Changed files in the branding/expiry update

## Application

| File                                                                                               | Change                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/expiry.ts` (new)                                                                           | Single Karachi business-date, month-expiry normalization, threshold and status policy shared by UI/backend.                                                                   |
| `server/expiry.ts` (new)                                                                           | Stock-entry expiry validation and override audit metadata.                                                                                                                    |
| `server/engine.ts`                                                                                 | Per-line purchase/opening/import checks, acknowledgements, restricted-release checks and audit records. Existing financial calculations and FEFO sale rules retained.         |
| `server/api.ts`                                                                                    | Read-only branding endpoint, exact line acknowledgement payload, safe merged settings save, zero-day threshold, POS next-expiry metadata. Administrator-only writes retained. |
| `server/reports.ts`                                                                                | Inventory/report expiry warnings use the shared threshold, including zero.                                                                                                    |
| `prisma/schema.prisma` and `prisma/migrations/20261102000000_expiry_acknowledgement/migration.sql` | Add only the default-false purchase-line acknowledgement field. Previous migrations unchanged.                                                                                |
| `web/main.tsx`                                                                                     | Configured sidebar/login branding and tab title; immediate settings updates; midnight refresh and stale-response protection.                                                  |
| `web/shared.tsx`                                                                                   | Shared Karachi date and midnight/focus/visibility update hook.                                                                                                                |
| `web/components/expiry.tsx` (new)                                                                  | Reusable compact expiry badges, inline warnings, acknowledgement and entry validation.                                                                                        |
| `web/screens/StoreSettings.tsx`                                                                    | Hide only the requested two controls; validate warning days; protect edits from late settings reloads.                                                                        |
| `web/screens/Purchases.tsx`                                                                        | Real-time independent line warnings, reset acknowledgements, protected posting and preserved drafts.                                                                          |
| `web/screens/Inventory.tsx`                                                                        | Batch badges/filters, opening/import acknowledgements and restricted stock handling.                                                                                          |
| `web/screens/POS.tsx`                                                                              | Non-blocking warning for valid near-expiry batches.                                                                                                                           |
| `web/style.css`                                                                                    | Small theme-compatible branding/expiry styles; contained long store names.                                                                                                    |

## Tests and Windows delivery

- New `tests/expiry.test.ts` and `tests/browser/branding-expiry.spec.ts` cover the new behavior.
- `tests/fixtures/store-logo.png` is a synthetic test logo, not an uploaded store logo.
- `tests/engine.test.ts` uses a pre-existing expired-stock fixture to verify sales rejection without relying on newly forbidden normal expired-stock entry.
- New `scripts/windows/Update.ps1` and `Update-Sehat.cmd` back up, build, and recreate only the app using the existing project/volume.
- `docs/UPDATE-WINDOWS.md` contains exact safe PowerShell commands for `F:\Sehat-MedicalStore`.
- README, API documentation, Windows installation/verification documentation and this summary describe the changes and tests.

No pricing, financial formulas, payment workflows or unrelated profile fields were changed. No application records or settings are included in the ZIP. The new source ZIP excludes `.env`, credentials, database dumps, dependencies and build/test caches.
