# Deployment and recovery

## Production prerequisites

Node 24; PostgreSQL 16; a private database network; HTTPS reverse proxy; durable backup storage; a store-specific administrator, licence details and verified medicine data. Keep real credentials outside Git. Use a random JWT_SECRET, a production DATABASE_URL with verified TLS, and NODE_ENV=production. The schema migrations require pg_trgm extension creation; a DBA can provision that extension before a limited migration user runs the search migration.

Build with `npm ci && npm run build`, run `npm run db:migrate` as a controlled release step, then `npm start` under a process supervisor. Run the seed command once with your own administrator credentials; omit `--demo` in a real store. The supplied Dockerfile runs as the unprivileged node user. It installs the locked toolchain because startup uses tsx; do not use `npm ci --omit=dev` with this image. In managed cloud builds pass the supplied proxy CA as a BuildKit secret (`--secret id=proxy_ca,src="$CODEX_PROXY_CERT"`); do not disable TLS verification.

Proxy the UI and `/api` to port 3001 under the same HTTPS origin. Restrict direct access to that port and PostgreSQL; do not expose port 5432 publicly. Health checks use `/api/health`. Persist PostgreSQL data and BACKUP_DIR. The Compose file provides the app, database and a local scheduled-backup worker. It is a loopback-only Windows/local convenience, not a public production hosting setup. Its backup worker uses the PostgreSQL 16 client directly, without mounting the Docker socket. Apply least-privilege database access and monitoring on the deployment host. Review memory-based login rate limiting before running multiple API replicas.

## Scheduled backups

`npm run backup` uses pg_dump custom format, writes mode-0600 files, avoids putting passwords on the command line, and deletes incomplete output on failure. Use PostgreSQL client tools compatible with your server. For the local Docker database set `PG_DUMP_CONTAINER=medicalstore-db`; Docker access is required. Set `BACKUP_DIR` for durable storage.

Set `ENABLE_BACKUPS=true` to enable the single-process API scheduler: it runs during 02:00–03:00 Asia/Karachi and retries failures within that hour. It starts fresh after process restart. For production prefer the provided `scripts/backup.cron.example` or a host scheduler with failure alerts; use only one scheduling mechanism. A stopped process cannot make scheduled backups. No off-site transport or deletion/retention policy is enabled automatically. Encrypt and copy backups to separate storage, monitor success, and test restores regularly.

## Restore drill

Restore into a **new empty database**, never over the live store:

```sh
createdb medicalstore_restore_test
pg_restore --exit-on-error --dbname=medicalstore_restore_test /secure/path/medicalstore-TIMESTAMP.dump
```

Use standard PostgreSQL environment variables or a mode-0600 pgpass file for authentication. Avoid credentials in shell history. Compare record counts and reconcile:

```sql
SELECT count(*) FROM "Medicine";
SELECT b.id, b.quantity, coalesce(sum(m.quantity),0) AS ledger
FROM "Batch" b LEFT JOIN "Movement" m ON m."batchId"=b.id
GROUP BY b.id HAVING b.quantity <> coalesce(sum(m.quantity),0);
```

An empty discrepancy result is required. Point a separate test API instance at the restored database, sign in, inspect invoices and receipts, and only then plan a controlled switchover. The migration metadata and append-only triggers are included in custom-format dumps. The local development database was backed up and restored into `medicalstore_restore_test`: four medicines restored and zero unbalanced batches. This verifies local recovery, not your eventual production host or off-site storage.

## Verification and limitations

`npm test` exercises real PostgreSQL, including concurrent overselling, idempotency, FEFO, historical cost, returns, rollback and reconciliation. `npm run test:e2e` exercises the browser workflow and PDF route on a separate test database. Keep tests away from live store data. Physical 58/80 mm printer output, scanner timing, deployment-specific TLS and representative load require validation at the store. Do not import demonstration balances into a real store database.
