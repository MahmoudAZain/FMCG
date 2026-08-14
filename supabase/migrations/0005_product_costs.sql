-- 0005 — Cost prices, deliberately isolated
--
-- This is a separate table rather than a column on `products`, and that is the
-- whole point (research R8, FR-063, SC-008).
--
-- A `cost_price` column would depend on every query, forever, remembering to
-- omit it. One `select('*')` in one future admin route, one CSV export that
-- iterates object keys, and the margin sheet is public. A separate table with
-- no grant to anon, customer or staff cannot leak that way: asking for it
-- returns "permission denied", not a value.

create table public.product_costs (
  product_id    uuid primary key references public.products (id) on delete cascade,

  -- Piastres. What we paid, never what we charge.
  cost_price    integer     not null,

  supplier_name text,
  updated_by    uuid references public.profiles (id) on delete set null,
  updated_at    timestamptz not null default now(),

  constraint product_costs_non_negative check (cost_price >= 0)
);

comment on table public.product_costs is
  'Admin-only. No grant exists for anon, customer or staff — a leaked cost sheet hands competitors the business.';
