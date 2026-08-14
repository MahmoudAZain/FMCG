-- 0003 — Delivery governorates and customer addresses
--
-- A governorate is the unit of delivery pricing: one fee, one minimum order
-- value. All 27 are seeded (FR-056a); `is_active` decides which are served, so
-- expanding coverage is a toggle and two numbers rather than data entry.

create table public.governorates (
  id              uuid primary key default gen_random_uuid(),
  name_ar         text        not null,
  name_en         text        not null,

  -- Piastres. Every amount in this system is an integer (research R5).
  delivery_fee    integer     not null default 0,
  min_order_value integer     not null default 0,

  is_active       boolean     not null default false,
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint governorates_name_ar_present check (char_length(btrim(name_ar)) > 0),
  constraint governorates_name_en_present check (char_length(btrim(name_en)) > 0),
  constraint governorates_fee_non_negative check (delivery_fee >= 0),
  constraint governorates_minimum_non_negative check (min_order_value >= 0)
);

create unique index governorates_name_en_key on public.governorates (lower(name_en));
create index governorates_active_idx on public.governorates (sort_order) where is_active;

create trigger governorates_touch_updated_at
  before update on public.governorates
  for each row execute function public.touch_updated_at();

comment on table public.governorates is
  'All 27 Egyptian governorates. is_active decides which are served; customers only ever see active ones.';
comment on column public.governorates.delivery_fee is 'Piastres. 2500 = 25.00 EGP.';

-- ---------------------------------------------------------------------------
-- Addresses
-- ---------------------------------------------------------------------------
create table public.addresses (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid        not null references public.profiles (id) on delete cascade,
  governorate_id  uuid        not null references public.governorates (id) on delete restrict,
  street_address  text        not null,

  -- Not optional. The business states plainly that drivers cannot find Egyptian
  -- addresses without one, so the database refuses an address without it —
  -- rather than trusting every future form to remember (FR-007).
  landmark        text        not null,

  building        text,
  floor_apartment text,
  is_default      boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint addresses_street_length check (char_length(btrim(street_address)) between 5 and 300),
  constraint addresses_landmark_length check (char_length(btrim(landmark)) between 3 and 200),
  constraint addresses_building_length check (building is null or char_length(building) <= 60),
  constraint addresses_floor_length check (floor_apartment is null or char_length(floor_apartment) <= 60)
);

create index addresses_profile_idx on public.addresses (profile_id);

-- At most one default per customer (FR-015).
create unique index addresses_one_default_per_profile
  on public.addresses (profile_id) where is_default;

create trigger addresses_touch_updated_at
  before update on public.addresses
  for each row execute function public.touch_updated_at();

comment on column public.addresses.landmark is
  'Required. Drivers cannot locate Egyptian addresses without one; the order snapshots it at placement.';
