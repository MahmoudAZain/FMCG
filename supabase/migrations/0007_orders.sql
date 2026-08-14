-- 0007 — Orders, order lines and the status history
--
-- The order carries its own copy of the delivery address, the governorate name
-- and the fee charged. A customer editing an address after ordering must not
-- change where the driver was told to go, and a later price change must not
-- rewrite what someone was charged (FR-034, FR-040).

create table public.orders (
  id                uuid primary key default gen_random_uuid(),

  -- Read aloud over the phone, in Arabic, on a bad line. A UUID is unusable
  -- for that (research R14, FR-039).
  reference         text        not null,

  profile_id        uuid        not null references public.profiles (id) on delete restrict,
  governorate_id    uuid        not null references public.governorates (id) on delete restrict,
  status            public.order_status not null default 'submitted',

  -- All piastres, all computed by place_order() from stored data.
  subtotal          integer     not null,
  discount_total    integer     not null default 0,
  delivery_fee      integer     not null,
  grand_total       integer     not null,

  -- Address snapshot, as it stood at placement.
  recipient_name       text not null,
  recipient_phone      text not null,
  street_address       text not null,
  landmark             text not null,
  building             text,
  floor_apartment      text,
  governorate_name_ar  text not null,
  governorate_name_en  text not null,

  customer_note     text,

  -- A double-tap or a resubmitted form produces one order, not two (FR-038).
  idempotency_key   text        not null,

  placed_at         timestamptz not null default now(),
  delivered_at      timestamptz,
  cancelled_at      timestamptz,
  updated_at        timestamptz not null default now(),

  constraint orders_amounts_non_negative check (
    subtotal >= 0 and discount_total >= 0 and delivery_fee >= 0 and grand_total >= 0
  ),

  -- A structural guarantee that the recorded total is internally coherent.
  -- Backs SC-005: whatever else goes wrong, an order cannot store a total that
  -- disagrees with its own parts.
  constraint orders_total_consistent check (
    grand_total = subtotal - discount_total + delivery_fee
  ),

  constraint orders_note_length check (customer_note is null or char_length(customer_note) <= 500)
);

create unique index orders_reference_key on public.orders (reference);
create unique index orders_idempotency_key on public.orders (idempotency_key);

-- Customer order history, newest first (FR-062).
create index orders_profile_idx on public.orders (profile_id, placed_at desc);

-- The staff queue, filtered by state (FR-058).
create index orders_status_idx on public.orders (status, placed_at desc);
create index orders_governorate_idx on public.orders (governorate_id, placed_at desc);

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

comment on column public.orders.landmark is
  'Snapshot. The driver''s instruction as it stood at placement — editing the address later must not move the delivery.';

-- ---------------------------------------------------------------------------
-- Order lines
-- ---------------------------------------------------------------------------
create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid        not null references public.orders (id) on delete cascade,

  -- RESTRICT, not CASCADE: a product referenced by an order can never be
  -- deleted, only deactivated (FR-061).
  product_id       uuid        not null references public.products (id) on delete restrict,

  -- Snapshot, so a renamed or deactivated product leaves history readable.
  product_name_ar  text        not null,
  product_name_en  text        not null,
  unit             public.unit_type not null,
  pack_size        text,

  qty              integer     not null,
  unit_price       integer     not null,
  unit_discount    integer     not null default 0,
  line_total       integer     not null,
  promotion_id     uuid references public.promotions (id) on delete set null,

  constraint order_items_qty_positive check (qty > 0),
  constraint order_items_amounts_non_negative check (
    unit_price >= 0 and unit_discount >= 0 and line_total >= 0
  ),
  constraint order_items_discount_within_price check (unit_discount <= unit_price),
  constraint order_items_line_total_consistent check (
    line_total = (unit_price - unit_discount) * qty
  )
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- Status history — append-only
--
-- When a driver and a customer disagree about an order, this log is the only
-- evidence that exists. No role, including admin, is granted UPDATE or DELETE
-- on it (FR-047, enforced in 0009).
-- ---------------------------------------------------------------------------
create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid        not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  actor_id    uuid references public.profiles (id) on delete set null,

  -- Snapshot of the actor's role. If a staff account is later removed, the
  -- history still records that staff — not a customer — made the change.
  actor_role  public.user_role not null,

  note        text,
  created_at  timestamptz not null default now(),

  constraint order_status_history_note_length check (note is null or char_length(note) <= 500)
);

create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ---------------------------------------------------------------------------
-- Order references: EG-YYMMDD-NNNN, with NNNN a per-day sequence
-- ---------------------------------------------------------------------------
create sequence if not exists public.order_reference_seq;

create or replace function public.generate_order_reference()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  today_cairo date := (now() at time zone 'Africa/Cairo')::date;
  counter     integer;
begin
  -- Count today's orders in Cairo local time, so the daily sequence matches the
  -- business day staff worked (research R18).
  select count(*) + 1 into counter
  from public.orders
  where (placed_at at time zone 'Africa/Cairo')::date = today_cairo;

  return 'EG-' || to_char(today_cairo, 'YYMMDD') || '-' || lpad(counter::text, 4, '0');
end $$;
