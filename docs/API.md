# REST API

All paths below are under `/api`. Except login and health, endpoints require the HttpOnly JWT session cookie. Mutations also require `X-Requested-With: MedicalStore`. Login sets a SameSite=Strict cookie; production adds Secure. Sessions expire after eight hours; logout, password/role updates and deactivation revoke sessions using a user session version. Passwords use bcrypt (12 rounds). Login attempts are rate-limited per source IP in memory for the single-process deployment.

| Method         | Path                               | Access / behavior                                                                                                                                                                                    |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET            | /health                            | Database readiness                                                                                                                                                                                   |
| POST           | /auth/login                        | `{email,password}`                                                                                                                                                                                   |
| GET            | /auth/me                           | Current identity                                                                                                                                                                                     |
| POST           | /auth/logout                       | Revoke sessions                                                                                                                                                                                      |
| GET            | /medicines?q=                      | All roles; cashier response excludes costs                                                                                                                                                           |
| POST, PUT      | /medicines, /medicines/:id         | Manager/admin; complete medicine fields                                                                                                                                                              |
| POST           | /medicines/import                  | Manager/admin; `{rows:[medicine fields]}`; atomic                                                                                                                                                    |
| GET, POST      | /suppliers                         | Manager/admin                                                                                                                                                                                        |
| GET, POST      | /purchases                         | Manager/admin; POST saves draft                                                                                                                                                                      |
| PUT            | /purchases/:id                     | Edit draft only                                                                                                                                                                                      |
| POST           | /purchases/:id/post                | `{key:UUID}`; idempotent posting                                                                                                                                                                     |
| GET, POST      | /purchases/:id/attachment          | Read attachment; upload `{filename,mime,data:base64}` to draft                                                                                                                                       |
| GET, POST      | /sales                             | GET own sales for cashier; POST atomic sale                                                                                                                                                          |
| GET            | /sales/:id/receipt                 | PDF; own sales only for cashier                                                                                                                                                                      |
| GET            | /inventory, /movements?medicineId= | Manager/admin                                                                                                                                                                                        |
| POST           | /opening                           | Manager/admin; UUID key, medicineId, batchNumber, expiry, quantity, unit, unitCost, reference                                                                                                        |
| POST           | /opening/import                    | `{key:UUID,rows:[opening fields without key]}`; atomic                                                                                                                                               |
| POST           | /adjustments                       | Admin; UUID key, batchId, signed quantity, reason, reference                                                                                                                                         |
| PUT            | /batches/:id/status                | Manager/admin; status and inspection reason                                                                                                                                                          |
| GET, POST      | /returns                           | Manager/admin; linked sale allocation or purchase batch                                                                                                                                              |
| GET            | /reconciliation                    | Manager/admin; empty array means no discrepancies                                                                                                                                                    |
| GET            | /reports                           | Manager/admin; from/to ISO business dates, medicineId, supplierId                                                                                                                                    |
| GET            | /reports/export                    | Same filters; kind sales/purchases/inventory/movements/returns/profit/medicineSales/supplierPurchases/daily/inventorySummary/lowStock/outOfStock/nearExpiry/expired/adjustments; format csv/xlsx/pdf |
| GET, PUT       | /settings                          | GET all roles; PUT admin                                                                                                                                                                             |
| GET, POST, PUT | /users, /users/:id                 | Admin; no password hashes returned                                                                                                                                                                   |
| GET            | /audit                             | Admin; latest 500 events                                                                                                                                                                             |

Sale body:

```json
{
  "key": "generate-a-fresh-UUID",
  "lines": [
    {
      "medicineId": "medicine-UUID",
      "unit": "strip",
      "quantity": 2,
      "discount": "0"
    }
  ],
  "discount": "0",
  "payment": "CASH",
  "tendered": "500",
  "prescriptionReference": ""
}
```

Reusing a UUID with identical contents and the same actor returns the original result. Reusing it for a changed request rejects. For sales returns `originalId` is the original allocation ID; for purchase returns it is the original purchase batch ID. Return `quantity` is in base units. Disposition defaults to QUARANTINED. Supply reason/reference. Cashiers can discount only within the configured percentage (zero by default). Cashiers cannot return, adjust, see costs/profit, or administer users/settings. Managers can operate inventory and returns but adjustments require the administrator.

All stock mutations use serializable transactions plus a shared PostgreSQL transaction advisory lock. This single-store policy serializes writers and retries serialization conflicts. Database constraints reject negative balances. Ledger, sales, payments, returns and audit history are append-only. There are no delete routes for medicines or posted transactions.

## Branding and expiry policy update

`GET /branding` returns only the configured store name and logo for login/title rendering. Settings writes remain administrator-only. Settings saves merge existing records so hidden stock/discount controls retain their values. `expiryDays` accepts a non-negative safe integer, including zero.

Purchase lines accept `ignoreExpiryWarning` (default false). Posting checks the current policy again for each batch. A draft may be saved without acknowledgement, but cannot be posted while a warning remains unacknowledged. `POST /purchases/:id/post` can supply `expiryOverrides: [{lineId, medicineId, batchNumber, expiry}]` for independent confirmation of exact saved line identities. Expiry today/past is blocked for normal purchase posting regardless of acknowledgement.

Opening entries/import rows accept `ignoreExpiryWarning` and an optional existing batch `status` (default SELLABLE). Quarantined/restricted opening entries may retain past expiry dates, remain unavailable for POS, and cannot be released to sellable status without passing the same expiry policy. `PUT /batches/:id/status` accepts `ignoreExpiryWarning` for eligible near-expiry releases. Overrides create `EXPIRY_WARNING_OVERRIDE` audit records with medicine name/ID, batch, expiry, remaining days, warning threshold, Karachi date, source transaction, user and timestamp. Successful idempotent retries do not duplicate stock or audit entries.


## Product / credit / draft extension

All endpoints use the existing signed-in session and mutation request guard.

- `GET /master-data?kind=&all=true`, `POST /master-data`, `PUT/DELETE /master-data/:id`: searchable/configurable master data; administrator writes, safe delete.
- Product payloads add normalized master IDs, tracking flags, barcodeType, specifications and `packaging: [{unitId,factor,salePrice,fractionalAllowed}]`. Purchase/sale/opening unit accepts legacy base/strip/box or a configured UOM ID. `GET /medicines/:id/serials` lists currently available identities.
- `GET/POST /customers`, `GET/PUT /customers/:id`: customer master, balances, ledger, invoices, payment and purchase history. Cashier creates basic non-credit customers only.
- `GET/POST /bank-accounts`, `PUT /bank-accounts/:id`: bank selection; managers write.
- `POST /collections`, `POST /collections/:id/reverse`, `POST /credit-notes`: idempotent financial posting; reversal requires administrator; notes require manager/administrator.
- `GET /collections/:id/receipt`, `GET /customers/:id/statement`: PDF documents.
- `GET /credit-reports?kind=&from=&to=&customerId=&format=pdf`: manager reports; omit format for structured rows.
- `GET /pos-drafts`, `PUT /pos-drafts/:id`, `POST /pos-drafts/:id/resume`, `POST /pos-drafts/:id/discard`: owner-scoped draft CRUD with required revision/version. Manager read-only all=true listing is supported.
- `POST /sales` adds customerId, notes, split `payments`, optional draftId/draftVersion, expectedPrice and serialNumbers per line. Price changes return structured `issues` by row index; update expectedPrice to the acknowledged current price before retrying.
- `GET /sales/:id/receipt?format=58|80|A4`: configured PDF format using the original invoice number.

Payments record CASH/CARD/TRANSFER/CREDIT/ADVANCE (legacy RAAST/OTHER remain supported). Monetary values accept at most two decimals at checkout. Card fields accept last four digits only; no PAN/CVV fields are accepted. Transfer allocation needs bankAccountId and reference; verification remains OPERATOR_RECORDED.
