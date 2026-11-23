#!/usr/bin/env bash
# Verifies archive decryption + pg_restore readability, without touching production.
# Real restore to a separate Postgres remains necessary before claiming Q22.
set -Eeuo pipefail
umask 077
if [[ "$#" != 2 ]]; then echo 'Usage: validate-postgres-encrypted-backup.sh backup.age age-identity.txt' >&2; exit 2; fi
archive="$1"; identity="$2"
test -f "$archive" && test -f "$identity" || { echo 'Archive or private key missing' >&2; exit 2; }
for command in age pg_restore sha256sum; do command -v "$command" >/dev/null || exit 2; done
if [[ -f "$archive.sha256" ]]; then sha256sum --check --status "$archive.sha256" || { echo 'Checksum mismatch' >&2; exit 3; }; fi
age --decrypt --identity "$identity" "$archive" | pg_restore --list >/dev/null
printf 'ENCRYPTED_DB_ARCHIVE_READABLE=yes\n'
printf 'RESTORE_TESTED=no\n'
