#!/usr/bin/env bash
# A throwaway Postgres for running the integration suite locally.
#
# The integration tests skip themselves without DATABASE_URL, which is
# the right default on a laptop — but "skipped" and "passing" look
# identical in a test report, and these are the strongest checks in the
# project. This makes the not-skipping path a single command.
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/tmp/usalamasms-pgdata}
PGPORT=${PGPORT:-5433}

if [ ! -d "$PGDATA" ]; then
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA" 2>/dev/null || true
  chmod 700 "$PGDATA"
  su postgres -s /bin/bash -c "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
fi

su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/usalamasms-pg.log -o '-p $PGPORT -k /tmp' start" >/dev/null 2>&1 || true
sleep 2
psql -h /tmp -p "$PGPORT" -U postgres -c "CREATE DATABASE usalamasms;" >/dev/null 2>&1 || true

echo "export DATABASE_URL=\"postgresql://postgres@localhost:$PGPORT/usalamasms?host=/tmp\""
