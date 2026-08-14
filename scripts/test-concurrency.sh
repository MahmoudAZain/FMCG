#!/usr/bin/env bash
#
# SC-016: two customers order the last unit at the same moment. Exactly one
# succeeds, and stock never goes negative.
#
# This needs genuinely concurrent connections, so it runs two psql processes at
# once rather than living in the single-session SQL suites.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD

DB=elgomala_concurrency
PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB};" >/dev/null 2>&1
"${PSQL[@]}" -d postgres -c "create database ${DB};" >/dev/null 2>&1
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/_harness.sql" >/dev/null 2>&1
for m in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$m" >/dev/null 2>&1 || { echo "migration $(basename "$m") failed"; exit 1; }
done

# One product, one unit left, two customers holding it in their carts.
"${PSQL[@]}" -d "$DB" >/dev/null 2>&1 <<'SQL'
insert into auth.users (id, email) values
  ('11110000-0000-4000-8000-000000000001', 'a@phone.elgomala.local'),
  ('11110000-0000-4000-8000-000000000002', 'b@phone.elgomala.local');

insert into public.profiles (id, full_name, phone, role) values
  ('11110000-0000-4000-8000-000000000001', 'عميل أ', '+201000000031', 'customer'),
  ('11110000-0000-4000-8000-000000000002', 'عميل ب', '+201000000032', 'customer');

insert into public.governorates (id, name_ar, name_en, delivery_fee, min_order_value, is_active)
values ('22220000-0000-4000-8000-000000000001', 'محافظة', 'RaceTown', 0, 0, true);

insert into public.addresses (id, profile_id, governorate_id, street_address, landmark) values
  ('33330000-0000-4000-8000-000000000001', '11110000-0000-4000-8000-000000000001',
   '22220000-0000-4000-8000-000000000001', 'شارع أ', 'بجوار الجامع'),
  ('33330000-0000-4000-8000-000000000002', '11110000-0000-4000-8000-000000000002',
   '22220000-0000-4000-8000-000000000001', 'شارع ب', 'أمام المدرسة');

insert into public.categories (id, name_ar, name_en, slug)
values ('44440000-0000-4000-8000-000000000001', 'قسم', 'Race', 'race-cat');

-- Exactly one unit in stock.
insert into public.products (id, category_id, name_ar, name_en, slug, price, unit, sku, stock_qty)
values ('55550000-0000-4000-8000-000000000001', '44440000-0000-4000-8000-000000000001',
        'آخر قطعة', 'Last Unit', 'last-unit', 1000, 'piece', 'RACE-1', 1);
SQL

attempt() {  # $1 = user id, $2 = address id, $3 = idempotency key
  "${PSQL[@]}" -d "$DB" -At >/dev/null 2>&1 <<SQL
select set_config('request.jwt.claims', json_build_object('sub', '$1')::text, false);
-- Both sessions pause on the same barrier, then race for the row lock.
select pg_advisory_lock(42);
select pg_advisory_unlock(42);
select public.place_order(
  '[{"product_id":"55550000-0000-4000-8000-000000000001","qty":1}]'::jsonb,
  '$2', '$3');
SQL
  echo "$?"
}

# Hold the barrier so both sessions are in flight before either can proceed.
"${PSQL[@]}" -d "$DB" -At -c "select pg_advisory_lock(42);" >/dev/null 2>&1 &
holder=$!
sleep 1

attempt '11110000-0000-4000-8000-000000000001' '33330000-0000-4000-8000-000000000001' 'race-a' > /tmp/race_a.rc &
pid_a=$!
attempt '11110000-0000-4000-8000-000000000002' '33330000-0000-4000-8000-000000000002' 'race-b' > /tmp/race_b.rc &
pid_b=$!

sleep 1
wait $holder 2>/dev/null   # releasing the barrier session frees both racers
wait $pid_a $pid_b 2>/dev/null

orders=$("${PSQL[@]}" -d "$DB" -At -c "select count(*) from public.orders;")
stock=$("${PSQL[@]}" -d "$DB" -At -c "select stock_qty from public.products where sku = 'RACE-1';")

echo "orders created: ${orders}"
echo "stock left:     ${stock}"

fail=0
if [ "$orders" != "1" ]; then
  echo "✗ SC-016: expected exactly 1 order, got ${orders}"
  fail=1
fi
if [ "$stock" != "0" ]; then
  echo "✗ SC-016: expected 0 stock left, got ${stock}"
  fail=1
fi

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB};" >/dev/null 2>&1

if [ "$fail" -eq 0 ]; then
  echo "✓ concurrency: exactly one order won the last unit, stock never went negative"
else
  exit 1
fi
