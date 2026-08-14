-- 0001 — Extensions and enumerated types
--
-- Every enum here is a closed set the business named. Using enums rather than
-- free text means an invalid value is rejected by the database, not merely
-- absent from a dropdown (Constitution Principle VI).

create schema if not exists extensions;

-- Trigram matching for Arabic and English product search. Postgres ships no
-- Arabic stemmer, so `tsvector` is not an option (research R10).
create extension if not exists pg_trgm with schema extensions;

-- gen_random_uuid() is core since Postgres 13 — no pgcrypto needed for it.

do $$ begin
  create type public.user_role as enum ('customer', 'staff', 'admin');
exception when duplicate_object then null; end $$;

-- FR-052. How a product is sold.
do $$ begin
  create type public.unit_type as enum ('piece', 'kilo', 'carton', 'pack', 'liter');
exception when duplicate_object then null; end $$;

-- FR-052. How a product must be kept — drives how the fleet loads a van.
do $$ begin
  create type public.storage_type as enum ('ambient', 'chilled', 'frozen');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.discount_type as enum ('percent', 'fixed');
exception when duplicate_object then null; end $$;

-- FR-044. The full order lifecycle. Legal transitions between these are
-- enforced by set_order_status(), not by the admin screen (FR-045).
do $$ begin
  create type public.order_status as enum (
    'submitted',
    'confirmed',
    'preparing',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'returned'
  );
exception when duplicate_object then null; end $$;
