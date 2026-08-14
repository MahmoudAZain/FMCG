-- Order lifecycle — the transition table and the audit trail.
--
-- These rules live in the database rather than the admin screen so they hold
-- against any client (Constitution Principle VII).

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaa0000-0000-4000-8000-000000000001', '201000000011@phone.elgomala.local'),
  ('aaaa0000-0000-4000-8000-000000000002', '201000000012@phone.elgomala.local'),
  ('aaaa0000-0000-4000-8000-000000000009', '201000000019@phone.elgomala.local');

insert into public.profiles (id, full_name, phone, role) values
  ('aaaa0000-0000-4000-8000-000000000001', 'عميل أول',  '+201000000011', 'customer'),
  ('aaaa0000-0000-4000-8000-000000000002', 'عميل ثاني', '+201000000012', 'customer'),
  ('aaaa0000-0000-4000-8000-000000000009', 'موظف',      '+201000000019', 'staff');

insert into public.governorates (id, name_ar, name_en, delivery_fee, min_order_value, is_active)
values ('bbbb0000-0000-4000-8000-000000000001', 'محافظة اختبار', 'Testville', 1000, 0, true);

insert into public.addresses (id, profile_id, governorate_id, street_address, landmark) values
  ('cccc0000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
   'bbbb0000-0000-4000-8000-000000000001', '12 شارع النيل', 'بجوار مسجد النور');

insert into public.categories (id, name_ar, name_en, slug)
values ('dddd0000-0000-4000-8000-000000000001', 'قسم', 'Transition Test', 'transition-test');

insert into public.products (id, category_id, name_ar, name_en, slug, price, unit, sku, stock_qty)
values ('eeee0000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000001',
        'سلعة', 'Item', 'transition-item', 1000, 'piece', 'TRN-A', 1000);

-- Helper: a fresh submitted order, so each case starts from a known state.
create or replace function public.new_test_order(p_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000001')::text, false);

  select (public.place_order(
    '[{"product_id":"eeee0000-0000-4000-8000-000000000001","qty":1}]'::jsonb,
    'cccc0000-0000-4000-8000-000000000001', p_key
  ) ->> 'order_id')::uuid into v_id;

  return v_id;
end $$;

grant execute on function public.new_test_order(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The legal path, end to end
-- ---------------------------------------------------------------------------
select auth.login_as('aaaa0000-0000-4000-8000-000000000009');  -- staff

do $$
declare
  v_order uuid := public.new_test_order('trans-happy');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000009')::text, false);

  perform public.set_order_status(v_order, 'confirmed', 'called the customer');
  perform public.set_order_status(v_order, 'preparing');
  perform public.set_order_status(v_order, 'out_for_delivery');
  perform public.set_order_status(v_order, 'delivered');

  perform public.assert('transitions', 'an order runs submitted through delivered',
    (select status from public.orders where id = v_order) = 'delivered');

  perform public.assert('transitions', 'delivered_at is stamped on delivery',
    (select delivered_at is not null from public.orders where id = v_order));

  -- One row for the placement plus one per transition (FR-046, SC-010).
  perform public.assert('transitions', 'every transition appends exactly one history row',
    (select count(*) from public.order_status_history where order_id = v_order) = 5);

  perform public.assert('transitions', 'history records who acted',
    (select count(*) from public.order_status_history
     where order_id = v_order
       and actor_id = 'aaaa0000-0000-4000-8000-000000000009'
       and actor_role = 'staff') = 4);

  perform public.assert('transitions', 'a note is kept with the transition',
    (select note from public.order_status_history
     where order_id = v_order and to_status = 'confirmed') = 'called the customer');

  -- delivered -> returned is the one legal move after delivery.
  perform public.set_order_status(v_order, 'returned');
  perform public.assert('transitions', 'a delivered order may be returned',
    (select status from public.orders where id = v_order) = 'returned');
end $$;

-- ---------------------------------------------------------------------------
-- Illegal transitions are refused
-- ---------------------------------------------------------------------------
-- Staff attempting an illegal jump gets invalid_transition; a customer
-- attempting the same gets not_authorized first, because they may only cancel.
-- Both refusals matter, and they are different refusals.
do $$
declare v_order uuid := public.new_test_order('trans-skip');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000009')::text, false);
  begin
    perform public.set_order_status(v_order, 'delivered');
    perform public.assert('transitions', 'staff cannot jump submitted straight to delivered', false);
  exception when others then
    perform public.assert('transitions', 'staff cannot jump submitted straight to delivered',
      position('invalid_transition' in sqlerrm) > 0, sqlerrm);
  end;
end $$;

do $$
declare v_order uuid := public.new_test_order('trans-skip-customer');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000001')::text, false);
  begin
    perform public.set_order_status(v_order, 'delivered');
    perform public.assert('transitions', 'a customer cannot mark their own order delivered', false);
  exception when others then
    perform public.assert('transitions', 'a customer cannot mark their own order delivered',
      position('not_authorized' in sqlerrm) > 0, sqlerrm);
  end;
end $$;

do $$
declare v_order uuid := public.new_test_order('trans-back');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000009')::text, false);
  perform public.set_order_status(v_order, 'confirmed');
  perform public.set_order_status(v_order, 'preparing');
  perform public.set_order_status(v_order, 'out_for_delivery');
  perform public.set_order_status(v_order, 'delivered');

  begin
    perform public.set_order_status(v_order, 'preparing');
    perform public.assert('transitions', 'a delivered order cannot walk back to preparing', false);
  exception when others then
    perform public.assert('transitions', 'a delivered order cannot walk back to preparing',
      position('invalid_transition' in sqlerrm) > 0, sqlerrm);
  end;
end $$;

do $$
declare v_order uuid := public.new_test_order('trans-terminal');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000009')::text, false);
  perform public.set_order_status(v_order, 'cancelled');

  perform public.assert('transitions', 'cancelled_at is stamped on cancellation',
    (select cancelled_at is not null from public.orders where id = v_order));

  begin
    perform public.set_order_status(v_order, 'confirmed');
    perform public.assert('transitions', 'cancelled is terminal', false);
  exception when others then
    perform public.assert('transitions', 'cancelled is terminal',
      position('invalid_transition' in sqlerrm) > 0, sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Customer self-cancellation (FR-048)
-- ---------------------------------------------------------------------------
do $$
declare v_order uuid := public.new_test_order('trans-customer-cancel');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000001')::text, false);

  perform public.set_order_status(v_order, 'cancelled');

  perform public.assert('transitions', 'a customer may cancel their own submitted order',
    (select status from public.orders where id = v_order) = 'cancelled');

  perform public.assert('transitions', 'the customer is recorded as the actor',
    (select actor_role from public.order_status_history
     where order_id = v_order and to_status = 'cancelled') = 'customer');
end $$;

-- Once staff confirm, the customer can no longer cancel online: the basket may
-- already be picked.
do $$
declare v_order uuid := public.new_test_order('trans-too-late');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000009')::text, false);
  perform public.set_order_status(v_order, 'confirmed');

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000001')::text, false);
  begin
    perform public.set_order_status(v_order, 'cancelled');
    perform public.assert('transitions', 'a customer cannot cancel a confirmed order', false);
  exception when others then
    perform public.assert('transitions', 'a customer cannot cancel a confirmed order',
      position('order_already_moved' in sqlerrm) > 0, sqlerrm);
  end;
end $$;

-- A customer may not drive an order forward, only cancel it.
do $$
declare v_order uuid := public.new_test_order('trans-customer-confirm');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000001')::text, false);
  begin
    perform public.set_order_status(v_order, 'confirmed');
    perform public.assert('transitions', 'a customer cannot confirm their own order', false);
  exception when others then
    perform public.assert('transitions', 'a customer cannot confirm their own order',
      position('not_authorized' in sqlerrm) > 0, sqlerrm);
  end;
end $$;

-- A customer may not touch someone else's order at all.
do $$
declare v_order uuid := public.new_test_order('trans-other-customer');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-4000-8000-000000000002')::text, false);
  begin
    perform public.set_order_status(v_order, 'cancelled');
    perform public.assert('transitions', 'a customer cannot cancel another customer''s order', false);
  exception when others then
    perform public.assert('transitions', 'a customer cannot cancel another customer''s order',
      position('not_authorized' in sqlerrm) > 0, sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- The history is immutable — for everyone, including admin (FR-047)
-- ---------------------------------------------------------------------------
select auth.login_as('aaaa0000-0000-4000-8000-000000000009');

select public.assert_raises('transitions', 'staff cannot edit a history row',
  $$update public.order_status_history set to_status = 'delivered'
    where id = (select id from public.order_status_history limit 1)$$);

select public.assert_raises('transitions', 'staff cannot delete a history row',
  $$delete from public.order_status_history
    where id = (select id from public.order_status_history limit 1)$$);

select public.assert_raises('transitions', 'staff cannot change an order status directly',
  $$update public.orders set status = 'delivered'
    where id = (select id from public.orders limit 1)$$);

select auth.reset_role();
