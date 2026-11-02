#!/bin/sh
set -eu
umask 077
mkdir -p /backups
# Same PostgreSQL 16 client as the database; no host tools or Docker socket needed.
while :; do
    business_date=$(date +%Y-%m-%d)
    last_success=$(cat /backups/.last-success 2>/dev/null || true)
    if [ "$(date +%H)" = "02" ] && [ "$last_success" != "$business_date" ]; then
        target="/backups/sehat-auto-$(date +%Y%m%d-%H%M%S).dump"
        if pg_dump --format=custom --file="$target.partial"; then
            mv "$target.partial" "$target"
            printf '%s\n' "$business_date" > /backups/.last-success
            echo "Scheduled backup completed for $business_date."
        else
            rm -f "$target.partial"
            echo 'Scheduled backup failed; will retry in one minute.' >&2
        fi
    fi
    sleep 60
done
