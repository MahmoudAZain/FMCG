-- Row Level Security — the isolation guarantees.
--
-- Constitution Principle II requires that a route which forgets its check still
-- returns nothing. Every assertion here runs under a real role with real JWT
-- claims, never as the owner, because the owner bypasses the policies that are
-- the whole point.

-- ---------------------------------------------------------------------------
-- Fixtures: two customers, one staff member, one admin
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaa0000-0000-4000-8000-00000000000a', '201000000021@phone.elgomala.local'),
  ('aaaa0000-0000-4000-8000-00000000000b', '201000000022@phone.elgomala.local'),
  ('aaaa0000-0000-4000-8000-00000000000c', '201000000023@phone.elgomala.local'),
  ('aaaa0000-0000-4000-8000-00000000000d', '201000000024@phone.elgomala.local');

insert into public.profiles (id, full_name, phone, role) values
  ('aaaa0000-0000-4000-8000-00000000000a', 'عميل أ',   '+201000000021', 'customer'),
  ('aaaa0000-0000-4000-8000-00000000000b', 'عميل ب',   '+201000000022', 'customer'),
  ('aaaa0000-0000-4000-8000-00000000000c', 'موظف',     '+201000000023', 'staff'),
  ('aaaa0000-0000-4000-8000-00000000000d', 'مدير',     '+201000000024', 'admin');

insert into public.governorates (id, name_ar, name_en, delivery_fee, min_order_value, is_active)
values ('bbbb0000-0000-4000-8000-00000000000a', 'محافظة', 'RlsTown', 500, 0, true);

insert into public.addresses (id, profile_id, governorate_id, street_address, landmark) values
  ('cccc0000-0000-4000-8000-00000000000a', 'aaaa0000-0000-4000-8000-00000000000a',
   'bbbb0000-0000-4000-8000-00000000000a', 'شارع أ', 'بجوار الجامع'),
  ('cccc0000-0000-4000-8000-00000000000b', 'aaaa0000-0000-4000-8000-00000000000b',
   'bbbb0000-0000-4000-8000-00000000000a', 'شارع ب', 'أمام المدرسة');

insert into public.categories (id, name_ar, name_en, slug)
values ('dddd0000-0000-4000-8000-00000000000a', 'قسم', 'Rls', 'rls-cat');

insert into public.products (id, category_id, name_ar, name_en, slug, price, unit, sku, stock_qty, is_active)
values
  ('eeee0000-0000-4000-8000-00000000000a', 'dddd0000-0000-4000-8000-00000000000a',
   'سلعة', 'Visible Item', 'rls-visible', 1000, 'piece', 'RLS-A', 100, true),
  ('eeee0000-0000-4000-8000-00000000000b', 'dddd0000-0000-4000-8000-00000000000a',
   'سلعة مخفية', 'Hidden Item', 'rls-hidden', 1000, 'piece', 'RLS-B', 100, false);

insert into public.product_costs (product_id, cost_price) values
  ('eeee0000-0000-4000-8000-00000000000a', 600);

insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, product_id)
values ('عرض مستقبلي', 'Future promo', 'percent', 50,
        now() + interval '5 days', now() + interval '10 days',
        'eeee0000-0000-4000-8000-00000000000a');

-- Give each customer an order to be isolated from the other.
create or replace function public.seed_order(p_user uuid, p_address uuid, p_key text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, false);
  select (public.place_order(
    '[{"product_id":"eeee0000-0000-4000-8000-00000000000a","qty":1}]'::jsonb,
    p_address, p_key) ->> 'order_id')::uuid into v_id;
  return v_id;
end $$;

select public.seed_order('aaaa0000-0000-4000-8000-00000000000a', 'cccc0000-0000-4000-8000-00000000000a', 'rls-a');
select public.seed_order('aaaa0000-0000-4000-8000-00000000000b', 'cccc0000-0000-4000-8000-00000000000b', 'rls-b');
select auth.reset_role();

-- ===========================================================================
-- 1-5. One customer cannot reach another customer's anything (FR-062, SC-007)
-- ===========================================================================
select auth.login_as('aaaa0000-0000-4000-8000-00000000000a');

select public.assert('rls', '01 customer A cannot read customer B''s profile',
  (select count(*) from public.profiles where id = 'aaaa0000-0000-4000-8000-00000000000b') = 0);

select public.assert('rls', '02 customer A cannot read customer B''s addresses',
  (select count(*) from public.addresses where profile_id = 'aaaa0000-0000-4000-8000-00000000000b') = 0);

select public.assert('rls', '03 customer A cannot read customer B''s orders',
  (select count(*) from public.orders where idempotency_key = 'rls-b') = 0);

select public.assert('rls', '04 customer A cannot read customer B''s order lines',
  (select count(*) from public.order_items) = 1,
  'A should see only the single line from their own order');

select public.assert('rls', '05 customer A cannot read customer B''s order history',
  (select count(distinct order_id) from public.order_status_history) = 1);

select public.assert('rls', 'customer A can read their own order',
  (select count(*) from public.orders where idempotency_key = 'rls-a') = 1);

-- ===========================================================================
-- 6-8. Cost prices (FR-063, SC-008)
--
-- The table has no grant for any client role, so this is a refusal rather than
-- an empty result — an empty result is indistinguishable from "no cost
-- recorded".
-- ===========================================================================
select public.assert_raises('rls', '06 a customer cannot select from product_costs',
  $$select * from public.product_costs$$, 'permission denied');

select public.assert_raises('rls', '06b a customer calling get_product_cost is refused',
  $$select * from public.get_product_cost('eeee0000-0000-4000-8000-00000000000a')$$,
  'not_authorized');

select auth.login_as('aaaa0000-0000-4000-8000-00000000000c');  -- staff

select public.assert_raises('rls', '07 staff cannot select from product_costs',
  $$select * from public.product_costs$$, 'permission denied');

select public.assert_raises('rls', '07b staff calling get_product_cost is refused',
  $$select * from public.get_product_cost('eeee0000-0000-4000-8000-00000000000a')$$,
  'not_authorized');

select auth.login_as('aaaa0000-0000-4000-8000-00000000000d');  -- admin

select public.assert('rls', '08 an admin can read cost through the accessor',
  (select cost_price from public.get_product_cost('eeee0000-0000-4000-8000-00000000000a')) = 600);

-- ===========================================================================
-- 9-11. Orders cannot be written by a client at all (Principle I)
-- ===========================================================================
select auth.login_as('aaaa0000-0000-4000-8000-00000000000a');

select public.assert_raises('rls', '09 a customer cannot insert an order directly',
  $$insert into public.orders (
      reference, profile_id, governorate_id, subtotal, discount_total, delivery_fee,
      grand_total, recipient_name, recipient_phone, street_address, landmark,
      governorate_name_ar, governorate_name_en, idempotency_key)
    values ('EG-000000-9999', 'aaaa0000-0000-4000-8000-00000000000a',
            'bbbb0000-0000-4000-8000-00000000000a', 1, 0, 0, 1, 'x', '+201000000021',
            'x', 'x', 'x', 'x', 'forged')$$);

select public.assert_raises('rls', '10 a customer cannot rewrite an order total',
  $$update public.orders set grand_total = 1 where idempotency_key = 'rls-a'$$);

select public.assert_raises('rls', '11 a customer cannot mark their own order delivered',
  $$update public.orders set status = 'delivered' where idempotency_key = 'rls-a'$$);

select public.assert('rls', 'the order total is untouched after those attempts',
  (select grand_total from public.orders where idempotency_key = 'rls-a') = 1500);

-- ===========================================================================
-- 12-13. Privilege escalation and address forgery
-- ===========================================================================
select public.assert_raises('rls', '12 a customer cannot promote themselves to admin',
  $$update public.profiles set role = 'admin' where id = 'aaaa0000-0000-4000-8000-00000000000a'$$,
  'not_authorized');

select public.assert('rls', 'the customer is still a customer',
  (select role from public.profiles where id = 'aaaa0000-0000-4000-8000-00000000000a') = 'customer');

select public.assert_raises('rls', '13 a customer cannot file an address under another profile',
  $$insert into public.addresses (profile_id, governorate_id, street_address, landmark)
    values ('aaaa0000-0000-4000-8000-00000000000b', 'bbbb0000-0000-4000-8000-00000000000a',
            'شارع مزور', 'معلم مزور')$$,
  'row-level security');

-- A customer may still manage their own addresses. The policy has to block
-- forgery without blocking legitimate use.
do $$
begin
  insert into public.addresses (profile_id, governorate_id, street_address, landmark)
  values ('aaaa0000-0000-4000-8000-00000000000a', 'bbbb0000-0000-4000-8000-00000000000a',
          'شارع جديد', 'بجوار الصيدلية');
  perform public.assert('rls', 'a customer can still add their own address', true);
exception when others then
  perform public.assert('rls', 'a customer can still add their own address', false, sqlerrm);
end $$;

-- ===========================================================================
-- 14. The audit trail is immutable for everyone (FR-047)
-- ===========================================================================
select auth.login_as('aaaa0000-0000-4000-8000-00000000000d');  -- admin

select public.assert_raises('rls', '14 even an admin cannot edit order history',
  $$update public.order_status_history set to_status = 'delivered'
    where order_id = (select id from public.orders where idempotency_key = 'rls-a')$$);

select public.assert_raises('rls', '14b even an admin cannot delete order history',
  $$delete from public.order_status_history
    where order_id = (select id from public.orders where idempotency_key = 'rls-a')$$);

select public.assert_raises('rls', '14c even an admin cannot insert a fake history row',
  $$insert into public.order_status_history (order_id, to_status, actor_role)
    values ((select id from public.orders where idempotency_key = 'rls-a'), 'delivered', 'admin')$$);

-- ===========================================================================
-- 15-16. Catalog writes are admin-only
-- ===========================================================================
select auth.login_as('aaaa0000-0000-4000-8000-00000000000a');

-- Worth knowing precisely how RLS refuses a write: the USING clause filters the
-- row out of the update's scope, so the statement succeeds and changes NOTHING.
-- It does not raise. The guarantee is "zero rows affected", not "error" — and an
-- application that treats a successful UPDATE as proof of a change would be
-- wrong. Hence the row count is asserted, not just the absence of a change.
do $$
declare affected integer;
begin
  update public.products set price = 1 where id = 'eeee0000-0000-4000-8000-00000000000a';
  get diagnostics affected = row_count;
  perform public.assert('rls', '15 a customer''s product update affects zero rows',
    affected = 0, format('rows affected: %s', affected));
end $$;

select auth.login_as('aaaa0000-0000-4000-8000-00000000000c');  -- staff

do $$
declare affected integer;
begin
  update public.products set price = 1 where id = 'eeee0000-0000-4000-8000-00000000000a';
  get diagnostics affected = row_count;
  perform public.assert('rls', '16 a staff product update affects zero rows',
    affected = 0, format('rows affected: %s', affected));
end $$;

select public.assert('rls', 'the price is untouched after those attempts',
  (select price from public.products where id = 'eeee0000-0000-4000-8000-00000000000a') = 1000);

select auth.login_as('aaaa0000-0000-4000-8000-00000000000d');  -- admin

do $$
begin
  update public.products set price = 1100 where id = 'eeee0000-0000-4000-8000-00000000000a';
  perform public.assert('rls', 'an admin can change a product price',
    (select price from public.products where id = 'eeee0000-0000-4000-8000-00000000000a') = 1100);
exception when others then
  perform public.assert('rls', 'an admin can change a product price', false, sqlerrm);
end $$;

-- ===========================================================================
-- 17-18. Anonymous browsing sees only what is live
-- ===========================================================================
select auth.browse_anonymously();

select public.assert('rls', '17 an anonymous visitor cannot see an inactive product',
  (select count(*) from public.products where id = 'eeee0000-0000-4000-8000-00000000000b') = 0);

select public.assert('rls', 'an anonymous visitor can see an active product',
  (select count(*) from public.products where id = 'eeee0000-0000-4000-8000-00000000000a') = 1);

-- The view must hide what the table hides. A view runs with its OWNER's rights
-- unless security_invoker is set, and this one is owned by a role that bypasses
-- RLS — so without migration 0012 the outer scan sees every product, active or
-- not (migration 0012 explains why it appeared to work anyway).
select public.assert('rls', '17b the pricing view hides an inactive product too',
  (select count(*) from public.product_pricing
   where product_id = 'eeee0000-0000-4000-8000-00000000000b') = 0);

select public.assert('rls', 'the pricing view still shows an active product',
  (select count(*) from public.product_pricing
   where product_id = 'eeee0000-0000-4000-8000-00000000000a') = 1);

select public.assert('rls', 'the pricing view runs as the caller, not its owner',
  (select 'security_invoker=true' = any(c.reloptions)
   from pg_class c where c.relname = 'product_pricing'));

-- The seed ships live promotions, which an anonymous visitor SHOULD see. What
-- must stay invisible is the one that has not started yet (FR-028).
select public.assert('rls', '18 an anonymous visitor cannot see a future promotion',
  (select count(*) from public.promotions where name_en = 'Future promo') = 0);

select public.assert('rls', 'an anonymous visitor can see a live promotion',
  (select count(*) from public.promotions) > 0);

-- Stronger than an empty result: `orders` is granted to authenticated only, so
-- an anonymous visitor is refused at the grant, before RLS is even consulted.
select public.assert_raises('rls', 'an anonymous visitor cannot read orders at all',
  $$select count(*) from public.orders$$, 'permission denied');

select public.assert('rls', 'an anonymous visitor can browse governorates',
  (select count(*) from public.governorates where is_active) > 0);

-- ===========================================================================
-- 19-20. Internal tables
-- ===========================================================================
select auth.login_as('aaaa0000-0000-4000-8000-00000000000a');

select public.assert_raises('rls', '19 a customer cannot read login_attempts',
  $$select * from public.login_attempts$$, 'permission denied');

select auth.login_as('aaaa0000-0000-4000-8000-00000000000c');  -- staff

select public.assert('rls', '20 staff cannot read the admin audit log',
  (select count(*) from public.admin_audit_log) = 0);

-- ===========================================================================
-- Staff can do the job they are meant to do
-- ===========================================================================
select public.assert('rls', 'staff can read every order',
  (select count(*) from public.orders) = 2);

select public.assert('rls', 'staff can read customer addresses for delivery',
  (select count(*) from public.addresses) >= 2);

select public.assert('rls', 'staff can see an inactive product in the catalog',
  (select count(*) from public.products where id = 'eeee0000-0000-4000-8000-00000000000b') = 1);

select auth.reset_role();
