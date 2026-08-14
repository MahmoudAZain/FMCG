#!/usr/bin/env bash
#
# Phone normalization exists twice: once in TypeScript (src/lib/phone.ts) so the
# browser can reject a bad number without a round trip, and once in SQL
# (migration 0008) so the database refuses one regardless of which client sent
# it. Duplication is the right call there — but only while the two agree.
#
# This runs both over the same inputs and fails on any disagreement. Without it,
# a divergence would surface as a customer who can register through one path and
# not another, or worse, as two accounts for one person (FR-009, FR-011).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD

DB=elgomala_phone_parity
PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -q)

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB};" >/dev/null 2>&1
"${PSQL[@]}" -d postgres -c "create database ${DB};" >/dev/null 2>&1
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/_harness.sql" >/dev/null 2>&1
for m in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$m" >/dev/null 2>&1 || { echo "migration $(basename "$m") failed"; exit 1; }
done

# Every notation an Egyptian customer actually types, plus the ones that must be
# refused.
INPUTS=(
  '01001234567' '+201001234567' '00201001234567' '201001234567'
  '0100 123 4567' '010-0123-4567' '(010) 0123 4567' ' 01001234567 '
  '01101234567' '01201234567' '01501234567'
  '+20 100 123 4567' '0020-100-123-4567'
  '01301234567' '01401234567' '0221234567' '0100123456' '010012345678'
  '' 'not a phone' '+447700900000' '00' '+20' '0'
)

fail=0
printf '%-22s %-16s %-16s\n' 'INPUT' 'SQL' 'TYPESCRIPT'
printf '%.0s-' {1..58}; echo

for input in "${INPUTS[@]}"; do
  sql=$("${PSQL[@]}" -d "$DB" -At -c "select public.normalize_phone(\$phone\$${input}\$phone\$)" 2>/dev/null)
  [ -z "$sql" ] && sql='REJECT'

  ts=$(node --experimental-strip-types --input-type=module -e "
import {tryNormalizePhone} from '${ROOT}/src/lib/phone.ts';
console.log(tryNormalizePhone(process.argv[1]) ?? 'REJECT');
" -- "$input" 2>/dev/null)
  [ -z "$ts" ] && ts='TS_ERROR'

  marker=''
  if [ "$sql" != "$ts" ]; then
    marker='  ← DISAGREE'
    fail=1
  fi
  printf '%-22s %-16s %-16s%s\n' "'${input}'" "$sql" "$ts" "$marker"
done

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB};" >/dev/null 2>&1

echo
if [ "$fail" -eq 0 ]; then
  echo "✓ phone parity: SQL and TypeScript agree on all ${#INPUTS[@]} inputs"
else
  echo "✗ phone parity: the two implementations disagree — fix both, then rerun"
  exit 1
fi
