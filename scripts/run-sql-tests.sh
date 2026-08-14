#!/usr/bin/env bash
#
# Runs the SQL suites against a throwaway database.
#
# Each suite gets a fresh database built from the migrations and seed, so a
# suite can create fixtures freely without leaking into the next one.
#
# Against a local Supabase stack:  ./scripts/run-sql-tests.sh
# Against a plain Postgres:        PGHOST=/tmp PGPORT=5433 PGUSER=postgres ./scripts/run-sql-tests.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD

PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -q)
SUITES=("${@:-}")
if [ -z "${SUITES[0]:-}" ]; then
  mapfile -t SUITES < <(find "$ROOT/supabase/tests" -name '*.test.sql' | sort)
fi

total_pass=0
total_fail=0
failed_suites=()

for suite in "${SUITES[@]}"; do
  name="$(basename "$suite" .test.sql)"
  db="elgomala_test_${name}"

  "${PSQL[@]}" -d postgres -c "drop database if exists ${db};" >/dev/null 2>&1
  "${PSQL[@]}" -d postgres -c "create database ${db};" >/dev/null 2>&1

  if ! "${PSQL[@]}" -d "$db" -f "$ROOT/supabase/tests/_harness.sql" >/dev/null 2>&1; then
    echo "✗ ${name}: harness failed to apply"
    failed_suites+=("$name")
    continue
  fi

  applied=true
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    if ! out=$("${PSQL[@]}" -d "$db" -f "$migration" 2>&1); then
      echo "✗ ${name}: migration $(basename "$migration") failed"
      echo "$out" | head -5
      applied=false
      break
    fi
  done
  $applied || { failed_suites+=("$name"); continue; }

  # After the migrations: 0009 revokes every grant in public as its starting
  # position, which would strip anything granted earlier.
  if ! out=$("${PSQL[@]}" -d "$db" -f "$ROOT/supabase/tests/_testkit.sql" 2>&1); then
    echo "✗ ${name}: testkit failed to apply"
    echo "$out" | head -5
    failed_suites+=("$name")
    continue
  fi

  if ! out=$("${PSQL[@]}" -d "$db" -f "$ROOT/supabase/seed.sql" 2>&1); then
    echo "✗ ${name}: seed failed"
    echo "$out" | head -5
    failed_suites+=("$name")
    continue
  fi

  if ! out=$("${PSQL[@]}" -d "$db" -f "$suite" 2>&1); then
    echo "✗ ${name}: suite aborted"
    echo "$out" | head -15
    failed_suites+=("$name")
    continue
  fi

  pass=$("${PSQL[@]}" -d "$db" -At -c "select count(*) from _test_results where passed" 2>/dev/null)
  fail=$("${PSQL[@]}" -d "$db" -At -c "select count(*) from _test_results where not passed" 2>/dev/null)
  total_pass=$((total_pass + pass))
  total_fail=$((total_fail + fail))

  if [ "$fail" -gt 0 ]; then
    echo "✗ ${name}: ${pass} passed, ${fail} FAILED"
    "${PSQL[@]}" -d "$db" -c \
      "select name, coalesce(detail,'') as detail from _test_results where not passed" 2>/dev/null
    failed_suites+=("$name")
  else
    echo "✓ ${name}: ${pass} passed"
  fi

  "${PSQL[@]}" -d postgres -c "drop database if exists ${db};" >/dev/null 2>&1
done

echo
echo "──────────────────────────────────────────"
echo "  ${total_pass} passed, ${total_fail} failed"
if [ ${#failed_suites[@]} -gt 0 ]; then
  echo "  failing suites: ${failed_suites[*]}"
  exit 1
fi
echo "  all suites green"
