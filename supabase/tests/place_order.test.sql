-- place_order — the only path by which an order comes into existence.
--
-- The decisive cases are the ones where a client tries to influence the price.
-- SC-006 requires that it cannot, and not because we validated the payload —
-- because the payload's price fields are never read.

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaa0000-0000-4000-8000-000000000001', '201000000011@phone.elgomala.local'),
  ('aaaa0000-0000-4000-8000-000000000002', '201000000012@phone.elgomala.local');

insert into public.profiles (id, full_name, phone, role) values
  ('aaaa0000-0000-4000-8000-000000000001', 'عميل أول',  '+201000000011', 'customer'),
  ('aaaa0000-0000-4000-8000-000000000002', 'عميل ثاني', '+201000000012', 'customer');

-- A governorate with values chosen so the arithmetic is checkable by eye:
-- 1000 piastres delivery, 5000 minimum order.
insert into public.governorates (id, name_ar, name_en, delivery_fee, min_order_value, is_active)
values ('bbbb0000-0000-4000-8000-000000000001', 'محافظة اختبار', 'Testville', 1000, 5000, true);

insert into public.governorates (id, name_ar, name_en, delivery_fee, min_order_value, is_active)
values ('bbbb0000-0000-4000-8000-000000000002', 'محافظة مغلقة', 'Closedville', 1000, 0, false);

insert into public.addresses (id, profile_id, governorate_id, street_address, landmark, is_default) values
  ('cccc0000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
   'bbbb0000-0000-4000-8000-000000000001', '12 شارع النيل', 'بجوار مسجد النور', true),
  ('cccc0000-0000-4000-8000-000000000002', 'aaaa0000-0000-4000-8000-000000000002',
   'bbbb0000-0000-4000-8000-000000000001', '5 شارع الهرم', 'أمام الصيدلية', true),
  ('cccc0000-0000-4000-8000-000000000003', 'aaaa0000-0000-4000-8000-000000000001',
   'bbbb0000-0000-4000-8000-000000000002', '7 شارع مغلق', 'بجوار البنك', false);

insert into public.categories (id, name_ar, name_en, slug)
values ('dddd0000-0000-4000-8000-000000000001', 'قسم', 'Order Test', 'order-test');

insert into public.products (id, category_id, name_ar, name_en, slug, price, unit, sku, stock_qty, min_order_qty)
values
  ('eeee0000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000001',
   'سلعة أ', 'Item A', 'order-item-a', 3000, 'piece', 'ORD-A', 100, 1),
  ('eeee0000-0000-4000-8000-000000000002', 'dddd0000-0000-4000-8000-000000000001',
   'سلعة ب', 'Item B', 'order-item-b', 1000, 'piece', 'ORD-B', 2, 1),
  ('eeee0000-0000-4000-8000-000000000003', 'dddd0000-0000-4000-8000-000000000001',
   'سلعة ج', 'Item C', 'order-item-c', 2000, 'piece', 'ORD-C', 100, 6),
  ('eeee0000-0000-4000-8000-000000000004', 'dddd0000-0000-4000-8000-000000000001',
   'سلعة د', 'Item D', 'order-item-d', 9000, 'piece', 'ORD-D', 100, 1);

-- ---------------------------------------------------------------------------
-- Happy path
-- ---------------------------------------------------------------------------
select auth.login_as('aaaa0000-0000-4000-8000-000000000001');

select public.assert('place_order', 'a valid order is created',
  (public.place_order(
     '[{"product_id":"eeee0000-0000-4000-8000-000000000001","qty":2}]'::jsonb,
     'cccc0000-0000-4000-8000-000000000001', 'key-happy-path'
   ) ->> 'grand_total')::integer = 7000,  -- 3000 x 2 + 1000 delivery
  'expected subtotal 6000 plus 1000 delivery');

select public.assert('place_order', 'the new order starts as submitted',
  (select status from public.orders where idempotency_key = 'key-happy-path') = 'submitted');

select public.assert('place_order', 'stock is decremented in the same transaction',
  (select stock_qty from public.products where id = 'eeee0000-0000-4000-8000-000000000001') = 98);

select public.assert('place_order', 'the initial status is recorded in history',
  (select count(*) from public.order_status_history h
   join public.orders o on o.id = h.order_id
   where o.idempotency_key = 'key-happy-path' and h.to_status = 'submitted') = 1);

select public.assert('place_order', 'the landmark is snapshotted onto the order',
  (select landmark from public.orders where idempotency_key = 'key-happy-path') = 'بجوار مسجد النور');

select public.assert('place_order', 'the reference is human-readable',
  (select reference from public.orders where idempotency_key = 'key-happy-path') ~ '^EG-[0-9]{6}-[0-9]{4}$');

-- ---------------------------------------------------------------------------
-- The cases that decide whether the business loses money
-- ---------------------------------------------------------------------------

-- A crafted payload carrying its own prices. Every price-like field here is
-- ignored: the order is written at the database's price (SC-006).
select public.place_order(
  '[{"product_id":"eeee0000-0000-4000-8000-000000000001","qty":2,
     "unit_price":1,"price":1,"line_total":1,"discount":9999}]'::jsonb,
  'cccc0000-0000-4000-8000-000000000001', 'key-tampered-price'
);

select public.assert('place_order', 'a client-supplied unit_price is ignored',
  (select unit_price from public.order_items i
   join public.orders o on o.id = i.order_id
   where o.idempotency_key = 'key-tampered-price') = 3000);

select public.assert('place_order', 'a client-supplied line_total is ignored',
  (select line_total from public.order_items i
   join public.orders o on o.id = i.order_id
   where o.idempotency_key = 'key-tampered-price') = 6000);

-- A payload that also tries to dictate the totals and the delivery fee.
select public.place_order(
  ('{"items":[{"product_id":"eeee0000-0000-4000-8000-000000000001","qty":2}],'
   || '"grand_total":0,"delivery_fee":0,"subtotal":0}')::jsonb,
  'cccc0000-0000-4000-8000-000000000001', 'key-tampered-total'
);

select public.assert('place_order', 'a client-supplied grand_total is ignored',
  (select grand_total from public.orders where idempotency_key = 'key-tampered-total') = 7000);

select public.assert('place_order', 'a client-supplied delivery_fee is ignored',
  (select delivery_fee from public.orders where idempotency_key = 'key-tampered-total') = 1000);

-- ---------------------------------------------------------------------------
-- Refusals
-- ---------------------------------------------------------------------------
select public.assert_raises('place_order', 'an order below the governorate minimum is refused',
  $$select public.place_order(
      '[{"product_id":"eeee0000-0000-4000-8000-000000000002","qty":1}]'::jsonb,
      'cccc0000-0000-4000-8000-000000000001', 'key-below-min')$$,
  'below_min_order_value');

select public.assert_raises('place_order', 'a quantity above stock is refused',
  $$select public.place_order(
      '[{"product_id":"eeee0000-0000-4000-8000-000000000002","qty":50}]'::jsonb,
      'cccc0000-0000-4000-8000-000000000001', 'key-no-stock')$$,
  'insufficient_stock');

select public.assert_raises('place_order', 'a quantity below the product minimum is refused',
  $$select public.place_order(
      '[{"product_id":"eeee0000-0000-4000-8000-000000000003","qty":3}]'::jsonb,
      'cccc0000-0000-4000-8000-000000000001', 'key-below-qty')$$,
  'below_min_qty');

select public.assert_raises('place_order', 'an empty cart is refused',
  $$select public.place_order('[]'::jsonb,
      'cccc0000-0000-4000-8000-000000000001', 'key-empty')$$,
  'empty_cart');

select public.assert_raises('place_order', 'an order to an inactive governorate is refused',
  $$select public.place_order(
      '[{"product_id":"eeee0000-0000-4000-8000-000000000004","qty":1}]'::jsonb,
      'cccc0000-0000-4000-8000-000000000003', 'key-closed-gov')$$,
  'governorate_inactive');

-- Another customer's address reports "not found" rather than "forbidden" — a
-- distinct error would confirm the address exists (FR-062).
select public.assert_raises('place_order', 'another customer''s address is not found',
  $$select public.place_order(
      '[{"product_id":"eeee0000-0000-4000-8000-000000000004","qty":1}]'::jsonb,
      'cccc0000-0000-4000-8000-000000000002', 'key-other-address')$$,
  'address_not_found');

-- Nothing partial survives a refusal (FR-037).
select public.assert('place_order', 'a refused order leaves no rows behind',
  (select count(*) from public.orders
   where idempotency_key in ('key-below-min','key-no-stock','key-below-qty',
                             'key-empty','key-closed-gov','key-other-address')) = 0);

select public.assert('place_order', 'a refused order does not touch stock',
  (select stock_qty from public.products where id = 'eeee0000-0000-4000-8000-000000000002') = 2);

-- ---------------------------------------------------------------------------
-- Idempotency (FR-038)
-- ---------------------------------------------------------------------------
select public.place_order(
  '[{"product_id":"eeee0000-0000-4000-8000-000000000004","qty":1}]'::jsonb,
  'cccc0000-0000-4000-8000-000000000001', 'key-double-tap');

select public.place_order(
  '[{"product_id":"eeee0000-0000-4000-8000-000000000004","qty":1}]'::jsonb,
  'cccc0000-0000-4000-8000-000000000001', 'key-double-tap');

select public.assert('place_order', 'a repeated submission creates exactly one order',
  (select count(*) from public.orders where idempotency_key = 'key-double-tap') = 1);

select public.assert('place_order', 'the replay is flagged rather than silently duplicated',
  (public.place_order(
     '[{"product_id":"eeee0000-0000-4000-8000-000000000004","qty":1}]'::jsonb,
     'cccc0000-0000-4000-8000-000000000001', 'key-double-tap'
   ) ->> 'idempotent_replay')::boolean);

select public.assert('place_order', 'a replay does not decrement stock twice',
  (select stock_qty from public.products where id = 'eeee0000-0000-4000-8000-000000000004') = 99);

-- ---------------------------------------------------------------------------
-- Price snapshot: a later price change must not rewrite history (FR-034)
-- ---------------------------------------------------------------------------
select public.place_order(
  '[{"product_id":"eeee0000-0000-4000-8000-000000000001","qty":2}]'::jsonb,
  'cccc0000-0000-4000-8000-000000000001', 'key-snapshot');

select auth.reset_role();
update public.products set price = 9999 where id = 'eeee0000-0000-4000-8000-000000000001';
select auth.login_as('aaaa0000-0000-4000-8000-000000000001');

select public.assert('place_order', 'a later price change does not alter a placed order',
  (select unit_price from public.order_items i
   join public.orders o on o.id = i.order_id
   where o.idempotency_key = 'key-snapshot') = 3000);

select public.assert('place_order', 'the order total is unchanged by a later price change',
  (select grand_total from public.orders where idempotency_key = 'key-snapshot') = 7000);

-- A renamed product leaves the order readable as it was sold.
select auth.reset_role();
update public.products set name_en = 'Renamed Item' where id = 'eeee0000-0000-4000-8000-000000000001';
select auth.login_as('aaaa0000-0000-4000-8000-000000000001');

select public.assert('place_order', 'the product name is snapshotted onto the line',
  (select product_name_en from public.order_items i
   join public.orders o on o.id = i.order_id
   where o.idempotency_key = 'key-snapshot') = 'Item A');

-- ---------------------------------------------------------------------------
-- price_cart mirrors placement (SC-005)
-- ---------------------------------------------------------------------------
select public.assert('place_order', 'price_cart agrees with what place_order charged',
  (public.price_cart(
     '[{"product_id":"eeee0000-0000-4000-8000-000000000004","qty":1}]'::jsonb,
     'bbbb0000-0000-4000-8000-000000000001'
   ) ->> 'grand_total')::integer = 10000);  -- 9000 + 1000 delivery

select public.assert('place_order', 'price_cart reports a shortfall against the minimum',
  (public.price_cart(
     '[{"product_id":"eeee0000-0000-4000-8000-000000000002","qty":1}]'::jsonb,
     'bbbb0000-0000-4000-8000-000000000001'
   ) ->> 'shortfall')::integer = 4000);

select public.assert('place_order', 'price_cart flags an empty cart rather than pricing it',
  public.price_cart('[]'::jsonb, 'bbbb0000-0000-4000-8000-000000000001')
    -> 'blocking_issues' -> 0 ->> 'code' = 'empty_cart');

select public.assert('place_order', 'price_cart never reserves stock',
  (select stock_qty from public.products where id = 'eeee0000-0000-4000-8000-000000000004') = 99);

select auth.reset_role();
