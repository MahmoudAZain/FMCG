-- 0009 — Row Level Security
--
-- Constitution Principle II: a route that forgets its authorization check must
-- still return nothing. These policies are that guarantee; the checks in the
-- application exist only so a user sees a clean "not allowed" page rather than
-- an empty one.

-- ---------------------------------------------------------------------------
-- Baseline: deny, then grant deliberately.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter table public.profiles             enable row level security;
alter table public.login_attempts       enable row level security;
alter table public.admin_audit_log      enable row level security;
alter table public.governorates         enable row level security;
alter table public.addresses            enable row level security;
alter table public.categories           enable row level security;
alter table public.brands               enable row level security;
alter table public.products             enable row level security;
alter table public.product_costs        enable row level security;
alter table public.product_photos       enable row level security;
alter table public.promotions           enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
grant select, update on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- RLS decides whether a row may be updated, not which columns the update
-- touches. Without this the policy above would let any customer promote
-- themselves to admin.
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- addresses
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.addresses to authenticated;

create policy addresses_own on public.addresses
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- WITH CHECK matters as much as USING: without it a customer could file an
-- address under someone else's profile.
create policy addresses_staff_read on public.addresses
  for select to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Catalog — public reads are limited to active rows
-- ---------------------------------------------------------------------------
grant select on public.governorates, public.categories, public.brands,
                public.products, public.product_photos, public.promotions,
                public.product_pricing
  to anon, authenticated;

grant insert, update, delete on public.governorates, public.categories,
                                public.brands, public.products,
                                public.product_photos, public.promotions
  to authenticated;

create policy governorates_public_read on public.governorates
  for select to anon, authenticated using (is_active or public.is_staff());
create policy governorates_admin_write on public.governorates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy categories_public_read on public.categories
  for select to anon, authenticated using (is_active or public.is_staff());
create policy categories_admin_write on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy brands_public_read on public.brands
  for select to anon, authenticated using (is_active or public.is_staff());
create policy brands_admin_write on public.brands
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy products_public_read on public.products
  for select to anon, authenticated using (is_active or public.is_staff());
create policy products_admin_write on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy product_photos_public_read on public.product_photos
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p
    where p.id = product_id and (p.is_active or public.is_staff())
  ));
create policy product_photos_admin_write on public.product_photos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A promotion is invisible until it is live: customers cannot read future or
-- expired ones at all (FR-028).
create policy promotions_public_read on public.promotions
  for select to anon, authenticated
  using ((is_active and now() between starts_at and ends_at) or public.is_staff());
create policy promotions_admin_write on public.promotions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- product_costs — admin only, and unreachable for everyone else
--
-- No grant to anon. No grant to staff. Asking for cost data as a customer or
-- as ordinary staff returns "permission denied", not an empty result
-- (FR-063, SC-008).
-- ---------------------------------------------------------------------------
-- No grant to anon. No grant to authenticated. None at all.
--
-- Supabase gives every signed-in user the same database role, `authenticated`,
-- so a table-level grant cannot distinguish an admin from a customer — a
-- grant-plus-policy arrangement would return an empty set to a customer rather
-- than refusing them. An empty set is indistinguishable from "no cost recorded",
-- and Principle II asks for a guarantee, not an ambiguity.
--
-- So the table is unreachable by any client role, and the two functions below
-- are the only door. They raise for a non-admin rather than returning nothing.
create policy product_costs_admin_only on public.product_costs
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.get_product_cost(p_product_id uuid)
returns table (product_id uuid, cost_price integer, supplier_name text, updated_at timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized'
      using detail = 'cost prices are visible to administrators only', errcode = '42501';
  end if;

  return query
    select c.product_id, c.cost_price, c.supplier_name, c.updated_at
    from public.product_costs c
    where c.product_id = p_product_id;
end $$;

create or replace function public.set_product_cost(
  p_product_id uuid,
  p_cost_price integer,
  p_supplier   text default null
)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized'
      using detail = 'cost prices are editable by administrators only', errcode = '42501';
  end if;

  insert into public.product_costs (product_id, cost_price, supplier_name, updated_by, updated_at)
  values (p_product_id, p_cost_price, p_supplier, auth.uid(), now())
  on conflict (product_id) do update
    set cost_price = excluded.cost_price,
        supplier_name = excluded.supplier_name,
        updated_by = excluded.updated_by,
        updated_at = now();
end $$;

grant execute on function public.get_product_cost(uuid) to authenticated;
grant execute on function public.set_product_cost(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- orders
--
-- No INSERT policy for any role: place_order() is the only creation path.
-- No UPDATE policy either: set_order_status() enforces the transition table and
-- writes history atomically. A direct update would let a customer mark their
-- own order delivered, or skip the history entry FR-046 requires.
-- ---------------------------------------------------------------------------
grant select on public.orders, public.order_items, public.order_status_history
  to authenticated;

create policy orders_select_own on public.orders
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

create policy order_items_select_own on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.profile_id = auth.uid() or public.is_staff())
  ));

-- Append-only. No INSERT, UPDATE or DELETE policy exists for any role,
-- including admin — rows are written only inside place_order() and
-- set_order_status(). When a driver and a customer disagree, this log is the
-- only evidence there is (FR-047).
create policy order_status_history_select_own on public.order_status_history
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.profile_id = auth.uid() or public.is_staff())
  ));

-- ---------------------------------------------------------------------------
-- login_attempts and admin_audit_log
--
-- login_attempts gets no policy at all: it is written and read only by
-- SECURITY DEFINER functions and the service role.
-- ---------------------------------------------------------------------------
grant select on public.admin_audit_log to authenticated;

create policy admin_audit_read on public.admin_audit_log
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Execute grants
-- ---------------------------------------------------------------------------
grant execute on function public.price_cart(jsonb, uuid) to anon, authenticated;
grant execute on function public.place_order(jsonb, uuid, text, text) to authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.effective_price(uuid, timestamptz) to anon, authenticated;
grant execute on function public.search_normalize(text) to anon, authenticated;
grant execute on function public.normalize_phone(text) to anon, authenticated;
grant execute on function public.category_ancestors(uuid) to anon, authenticated;
