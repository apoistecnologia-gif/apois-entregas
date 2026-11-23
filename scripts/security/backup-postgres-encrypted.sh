#!/usr/bin/env bash
# APOIS - encrypted database backup. Requires PostgreSQL client and age.
# DOES NOT include Supabase Storage objects; back those up separately.
set -Eeuo pipefail
umask 077
required=(APOIS_BACKUP_PROJECT APOIS_BACKUP_DIRECTORY APOIS_BACKUP_RECIPIENT APOIS_DB_HOST APOIS_DB_USER APOIS_DB_PASSWORD)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then printf 'Missing required environment variable: %s\n' "$name" >&2; exit 2; fi
done
case "$APOIS_BACKUP_PROJECT" in
  entregas) ref='ptgkwyyolrdgnqketkjj' ;;
  corridas) ref='tbbzkrfupmqdywnzgnms' ;;
  *) echo 'APOIS_BACKUP_PROJECT must be entregas or corridas' >&2; exit 2 ;;
esac
if [[ "$APOIS_DB_HOST" == "db.${ref}.supabase.co" ]]; then
  [[ "$APOIS_DB_USER" == "postgres" ]] || { echo 'Unexpected direct-connection username' >&2; exit 2; }
elif [[ "$APOIS_DB_HOST" == *.pooler.supabase.com ]]; then
  [[ "$APOIS_DB_USER" == "postgres.${ref}" ]] || { echo 'Unexpected pooler username' >&2; exit 2; }
else
  echo 'Database target is not linked to the expected official Supabase project.' >&2
  exit 2
fi
for command in pg_dump age sha256sum; do
  if ! command -v "$command" >/dev/null; then printf 'Missing command: %s\n' "$command" >&2; exit 2; fi
done
if [[ -z "${PGSSLROOTCERT:-}" || ! -f "$PGSSLROOTCERT" ]]; then
  echo 'PGSSLROOTCERT must point to the trusted database CA certificate.' >&2
  exit 2
fi
if [[ ! "$APOIS_BACKUP_RECIPIENT" =~ ^age1[a-z0-9]+$ ]]; then
  echo 'APOIS_BACKUP_RECIPIENT must be an age public recipient.' >&2
  exit 2
fi
install -d -m 0700 "$APOIS_BACKUP_DIRECTORY"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="${APOIS_BACKUP_DIRECTORY%/}/${APOIS_BACKUP_PROJECT}-${stamp}.pgdump.age"
if [[ -e "$output" ]]; then echo 'Backup path already exists.' >&2; exit 2; fi
export PGPASSWORD="$APOIS_DB_PASSWORD" PGSSLMODE=verify-full PGSSLROOTCERT
export PGHOST="$APOIS_DB_HOST" PGUSER="$APOIS_DB_USER" PGDATABASE=postgres
export PGPORT="${APOIS_DB_PORT:-5432}"
trap 'rm -f -- "$output"' ERR INT TERM
pg_dump --format=custom --no-owner --no-acl \
  | age --recipient "$APOIS_BACKUP_RECIPIENT" --output "$output"
test -s "$output"
sha256sum "$output" > "$output.sha256"
trap - ERR INT TERM
unset APOIS_DB_PASSWORD PGPASSWORD
printf 'ENCRYPTED_DB_BACKUP_CREATED=%s\n' "$output"
printf 'STORAGE_OBJECTS_INCLUDED=no\n'
printf 'RESTORE_TESTED=no\n'
