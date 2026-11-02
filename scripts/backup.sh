#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
mkdir -p "${BACKUP_DIR:-backups}"
backup_path="${BACKUP_DIR:-backups}/medicalstore-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
export BACKUP_PATH="$backup_path"
node --input-type=module - <<'JS'
import 'dotenv/config';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const u=new URL(process.env.DATABASE_URL||'');
const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1)};
if(u.searchParams.has('sslmode'))env.PGSSLMODE=u.searchParams.get('sslmode');
const fd=fs.openSync(process.env.BACKUP_PATH,'wx',0o600);
let r;
try{r=process.env.PG_DUMP_CONTAINER?spawnSync('docker',['exec','-e','PGUSER','-e','PGPASSWORD','-e','PGDATABASE',process.env.PG_DUMP_CONTAINER,'pg_dump','--format=custom'],{env,stdio:['ignore',fd,'inherit']}):spawnSync('pg_dump',['--format=custom'],{env,stdio:['ignore',fd,'inherit']});}finally{fs.closeSync(fd);}
if(r.error||r.status){fs.unlinkSync(process.env.BACKUP_PATH);if(r.error)throw r.error;process.exit(r.status||1);}
JS
echo "Backup created: $backup_path"
