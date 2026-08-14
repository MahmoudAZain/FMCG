-- 0008 — Normalisation helpers, role helpers, and the order transaction
--
-- This file holds the two functions that decide whether the business loses
-- money: price_cart() and place_order(). They share one pricing path, so the
-- total a customer is shown and the total recorded on the order cannot
-- diverge (SC-005).

-- ---------------------------------------------------------------------------
-- Role helpers
--
-- SECURITY DEFINER because a policy on `profiles` that itself queries
-- `profiles` would recurse. STABLE so the planner caches within a statement.
-- `SET search_path = public` is mandatory on every definer-rights function —
-- without it a caller can redirect the function to a different table.
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_role_name() in ('staff', 'admin'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_role_name() = 'admin', false)
$$;

-- ---------------------------------------------------------------------------
-- normalize_phone — every notation of one Egyptian mobile becomes one string
--
-- FR-009. Without this, the same customer registers twice and their order
-- history splits in half.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone(p_input text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  digits text;
  result text;
begin
  if p_input is null then
    raise exception 'invalid_phone' using detail = 'phone is required';
  end if;

  -- Strip everything that is not a digit: spaces, dashes, parentheses, the
  -- leading plus. Egyptian customers type all of these.
  digits := regexp_replace(p_input, '[^0-9]', '', 'g');

  -- 00 20 1XXXXXXXX  (international access code)
  if digits ~ '^0020' then
    digits := substring(digits from 5);
  -- 20 1XXXXXXXX     (country code, no plus)
  elsif digits ~ '^20' and char_length(digits) = 12 then
    digits := substring(digits from 3);
  -- 0 1XXXXXXXX      (local form)
  elsif digits ~ '^0' and char_length(digits) = 11 then
    digits := substring(digits from 2);
  end if;

  result := '+20' || digits;

  if result !~ '^\+201[0-25][0-9]{8}$' then
    raise exception 'invalid_phone'
      using detail = 'not a valid Egyptian mobile number: ' || p_input;
  end if;

  return result;
end $$;

-- ---------------------------------------------------------------------------
-- search_normalize — fold the ways Arabic is actually typed
--
-- Egyptian shoppers write مياه and مياة interchangeably, with diacritics or
-- without. Folding both sides of the comparison is what makes search find
-- things (research R10). Must be IMMUTABLE — it backs a generated column.
-- ---------------------------------------------------------------------------
create or replace function public.search_normalize(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    translate(
      lower(coalesce(p_text, '')),
      -- alef forms → ا | ta marbuta → ه | alef maqsura → ي | hamza forms
      'أإآٱةىؤئ' ||
      -- tashkeel (fatha, damma, kasra, shadda, sukun, tanween) and tatweel,
      -- all deleted: `to` is shorter than `from`, so these have no replacement
      'ًٌٍَُِّْـ',
      'ااااهيوي'
    ),
    '\s+', ' ', 'g'
  ))
$$;

-- ---------------------------------------------------------------------------
-- price_cart — the preview behind the cart and checkout screens
--
-- STABLE: it never mutates and never reserves stock. It reports problems so a
-- shopper sees them before committing (FR-035), while place_order() validates
-- independently — the preview is advisory, the placement is authoritative.
-- ---------------------------------------------------------------------------
create or replace function public.price_cart(
  p_items          jsonb,
  p_governorate_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  items          jsonb;
  gov            public.governorates%rowtype;
  line           jsonb;
  lines          jsonb := '[]'::jsonb;
  blocking       jsonb := '[]'::jsonb;
  v_subtotal     integer := 0;
  v_discount     integer := 0;
  v_fee          integer := 0;
  v_min          integer := 0;
  v_product      public.products%rowtype;
  v_price        record;
  v_qty          integer;
  v_issues       jsonb;
  v_line_total   integer;
begin
  -- Accept either a bare array or {"items": [...]}.
  items := case when jsonb_typeof(p_items) = 'object' then p_items -> 'items' else p_items end;

  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    return jsonb_build_object(
      'lines', '[]'::jsonb,
      'subtotal', 0, 'discount_total', 0, 'delivery_fee', 0, 'grand_total', 0,
      'min_order_value', 0, 'meets_minimum', false, 'shortfall', 0,
      'blocking_issues', jsonb_build_array(jsonb_build_object('code', 'empty_cart'))
    );
  end if;

  select * into gov from public.governorates where id = p_governorate_id;

  if not found or not gov.is_active then
    blocking := blocking || jsonb_build_object('code', 'governorate_inactive');
  else
    v_fee := gov.delivery_fee;
    v_min := gov.min_order_value;
  end if;

  for line in select * from jsonb_array_elements(items) loop
    v_qty := greatest(coalesce((line ->> 'qty')::integer, 0), 0);
    v_issues := '[]'::jsonb;

    select * into v_product from public.products where id = (line ->> 'product_id')::uuid;

    if not found or not v_product.is_active then
      lines := lines || jsonb_build_object(
        'product_id', line ->> 'product_id',
        'qty', v_qty,
        'available', false,
        'issues', jsonb_build_array(jsonb_build_object('code', 'inactive_product'))
      );
      continue;
    end if;

    -- Prices come from effective_price(), never from the payload. Any price
    -- the client sent is simply not read (FR-026).
    select * into v_price from public.effective_price(v_product.id, now());

    if v_product.stock_qty = 0 then
      v_issues := v_issues || jsonb_build_object('code', 'out_of_stock');
    elsif v_qty > v_product.stock_qty then
      v_issues := v_issues || jsonb_build_object(
        'code', 'insufficient_stock', 'available_qty', v_product.stock_qty
      );
    end if;

    if v_qty < v_product.min_order_qty then
      v_issues := v_issues || jsonb_build_object(
        'code', 'below_min_qty', 'min_order_qty', v_product.min_order_qty
      );
    end if;

    v_line_total := v_price.effective_price * v_qty;

    lines := lines || jsonb_build_object(
      'product_id',    v_product.id,
      'name_ar',       v_product.name_ar,
      'name_en',       v_product.name_en,
      'unit',          v_product.unit,
      'pack_size',     v_product.pack_size,
      'qty',           v_qty,
      'unit_price',    v_price.base_price,
      'unit_discount', v_price.discount_amount,
      'line_total',    v_line_total,
      'promotion_id',  v_price.promotion_id,
      'available',     jsonb_array_length(v_issues) = 0,
      'issues',        v_issues
    );

    v_subtotal := v_subtotal + v_line_total;
    v_discount := v_discount + (v_price.discount_amount * v_qty);
  end loop;

  if v_subtotal < v_min then
    blocking := blocking || jsonb_build_object(
      'code', 'below_min_order_value', 'shortfall', v_min - v_subtotal
    );
  end if;

  return jsonb_build_object(
    'lines',           lines,
    'subtotal',        v_subtotal,
    'discount_total',  v_discount,
    'delivery_fee',    v_fee,
    'grand_total',     v_subtotal + v_fee,
    'min_order_value', v_min,
    'meets_minimum',   v_subtotal >= v_min,
    'shortfall',       greatest(v_min - v_subtotal, 0),
    'blocking_issues', blocking
  );
end $$;

-- ---------------------------------------------------------------------------
-- place_order — the ONLY path by which an order comes into existence
--
-- `orders` has no INSERT policy for any role (0009). This function is
-- SECURITY DEFINER and therefore bypasses RLS, which is what makes "totals are
-- never trusted from the browser" a structural property rather than a rule
-- someone has to remember (Constitution Principle I).
--
-- The payload carries product ids and quantities. Nothing else is read.
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_items           jsonb,
  p_address_id      uuid,
  p_idempotency_key text,
  p_note            text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  items        jsonb;
  v_uid        uuid := auth.uid();
  v_profile    public.profiles%rowtype;
  v_address    public.addresses%rowtype;
  v_gov        public.governorates%rowtype;
  v_existing   public.orders%rowtype;
  v_order_id   uuid;
  v_reference  text;
  line         jsonb;
  v_product    public.products%rowtype;
  v_price      record;
  v_qty        integer;
  v_subtotal   integer := 0;
  v_discount   integer := 0;
  v_grand      integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using detail = 'sign in to place an order';
  end if;

  -- A repeated submission returns the order that already exists rather than
  -- creating a second one (FR-038).
  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'order_id', v_existing.id, 'reference', v_existing.reference,
      'subtotal', v_existing.subtotal, 'discount_total', v_existing.discount_total,
      'delivery_fee', v_existing.delivery_fee, 'grand_total', v_existing.grand_total,
      'status', v_existing.status, 'placed_at', v_existing.placed_at,
      'idempotent_replay', true
    );
  end if;

  items := case when jsonb_typeof(p_items) = 'object' then p_items -> 'items' else p_items end;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'empty_cart' using detail = 'no items submitted';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or not v_profile.is_active then
    raise exception 'not_authenticated' using detail = 'no active profile';
  end if;

  -- "not found" rather than "forbidden": a distinct error would confirm that
  -- another customer's address exists (FR-062).
  select * into v_address from public.addresses
  where id = p_address_id and profile_id = v_uid;
  if not found then
    raise exception 'address_not_found' using detail = 'no such address for this customer';
  end if;

  select * into v_gov from public.governorates where id = v_address.governorate_id;
  if not found or not v_gov.is_active then
    raise exception 'governorate_inactive'
      using detail = 'we do not currently deliver to this governorate';
  end if;

  -- Lock every referenced product in a fixed order (by id). A consistent lock
  -- order is what stops two concurrent orders touching the same products from
  -- deadlocking each other.
  perform 1
  from public.products
  where id in (
    select (elem ->> 'product_id')::uuid from jsonb_array_elements(items) elem
  )
  order by id
  for update;

  for line in select * from jsonb_array_elements(items) loop
    v_qty := coalesce((line ->> 'qty')::integer, 0);

    select * into v_product from public.products
    where id = (line ->> 'product_id')::uuid;

    if not found or not v_product.is_active then
      raise exception 'product_unavailable'
        using detail = coalesce(line ->> 'product_id', 'unknown');
    end if;

    if v_qty < v_product.min_order_qty then
      raise exception 'below_min_qty'
        using detail = format('%s requires at least %s', v_product.name_en, v_product.min_order_qty);
    end if;

    if v_qty > v_product.stock_qty then
      raise exception 'insufficient_stock'
        using detail = format('%s has only %s left', v_product.name_en, v_product.stock_qty);
    end if;

    -- Re-read the price under the lock. Whatever the preview showed, and
    -- whatever the client sent, this is what gets charged (FR-034).
    select * into v_price from public.effective_price(v_product.id, now());

    v_subtotal := v_subtotal + (v_price.effective_price * v_qty);
    v_discount := v_discount + (v_price.discount_amount * v_qty);
  end loop;

  if v_subtotal < v_gov.min_order_value then
    raise exception 'below_min_order_value'
      using detail = format('add %s more piastres to reach the minimum',
                            v_gov.min_order_value - v_subtotal);
  end if;

  v_grand := v_subtotal + v_gov.delivery_fee;
  v_reference := public.generate_order_reference();

  insert into public.orders (
    reference, profile_id, governorate_id, status,
    subtotal, discount_total, delivery_fee, grand_total,
    recipient_name, recipient_phone, street_address, landmark,
    building, floor_apartment, governorate_name_ar, governorate_name_en,
    customer_note, idempotency_key
  ) values (
    v_reference, v_uid, v_gov.id, 'submitted',
    v_subtotal, v_discount, v_gov.delivery_fee, v_grand,
    v_profile.full_name, v_profile.phone, v_address.street_address, v_address.landmark,
    v_address.building, v_address.floor_apartment, v_gov.name_ar, v_gov.name_en,
    p_note, p_idempotency_key
  )
  returning id into v_order_id;

  -- Lines carry a snapshot of the price and the product's name, so a later
  -- rename or price change never rewrites what someone was charged.
  for line in select * from jsonb_array_elements(items) loop
    v_qty := (line ->> 'qty')::integer;
    select * into v_product from public.products where id = (line ->> 'product_id')::uuid;
    select * into v_price from public.effective_price(v_product.id, now());

    insert into public.order_items (
      order_id, product_id, product_name_ar, product_name_en, unit, pack_size,
      qty, unit_price, unit_discount, line_total, promotion_id
    ) values (
      v_order_id, v_product.id, v_product.name_ar, v_product.name_en,
      v_product.unit, v_product.pack_size,
      v_qty, v_price.base_price, v_price.discount_amount,
      v_price.effective_price * v_qty, v_price.promotion_id
    );

    -- Same transaction as the order. The stock_qty >= 0 check constraint aborts
    -- the whole thing if a concurrent order won the race, so exactly one
    -- succeeds (SC-016).
    update public.products
    set stock_qty = stock_qty - v_qty
    where id = v_product.id;
  end loop;

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, actor_role)
  values (v_order_id, null, 'submitted', v_uid, v_profile.role);

  return jsonb_build_object(
    'order_id', v_order_id, 'reference', v_reference,
    'subtotal', v_subtotal, 'discount_total', v_discount,
    'delivery_fee', v_gov.delivery_fee, 'grand_total', v_grand,
    'status', 'submitted', 'placed_at', now(),
    'idempotent_replay', false
  );
end $$;

-- ---------------------------------------------------------------------------
-- set_order_status — the only path that changes an order's status
--
-- The transition table lives here rather than in the admin screen, so it holds
-- against any client (Constitution Principle VII, FR-045).
-- ---------------------------------------------------------------------------
create or replace function public.set_order_status(
  p_order_id   uuid,
  p_new_status public.order_status,
  p_note       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    public.user_role;
  v_order   public.orders%rowtype;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select role into v_role from public.profiles where id = v_uid and is_active;
  if v_role is null then
    raise exception 'not_authenticated' using detail = 'no active profile';
  end if;

  -- Lock the order and re-read its status inside the lock. A customer
  -- cancelling at the same moment staff confirm will serialize here: the loser
  -- finds a status its transition is not legal from (FR-050).
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;

  if v_role = 'customer' then
    if v_order.profile_id <> v_uid then
      raise exception 'not_authorized' using detail = 'not your order';
    end if;

    -- A customer may cancel only while the order is still submitted. After
    -- staff confirm, the basket may already be picked (FR-048).
    if not (v_order.status = 'submitted' and p_new_status = 'cancelled') then
      if p_new_status = 'cancelled' then
        raise exception 'order_already_moved'
          using detail = 'this order has already been confirmed and can no longer be cancelled online';
      end if;
      raise exception 'not_authorized' using detail = 'customers may only cancel a submitted order';
    end if;

    v_allowed := true;
  else
    v_allowed := case v_order.status
      when 'submitted'        then p_new_status in ('confirmed', 'cancelled')
      when 'confirmed'        then p_new_status in ('preparing', 'cancelled')
      when 'preparing'        then p_new_status in ('out_for_delivery', 'cancelled')
      when 'out_for_delivery' then p_new_status = 'delivered'
      when 'delivered'        then p_new_status = 'returned'
      else false  -- cancelled and returned are terminal
    end;
  end if;

  if not v_allowed then
    raise exception 'invalid_transition'
      using detail = format('%s -> %s is not a permitted transition', v_order.status, p_new_status);
  end if;

  update public.orders
  set status = p_new_status,
      delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end,
      cancelled_at = case when p_new_status = 'cancelled' then now() else cancelled_at end
  where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, actor_role, note)
  values (p_order_id, v_order.status, p_new_status, v_uid, v_role, p_note);

  return jsonb_build_object(
    'order_id', p_order_id,
    'from_status', v_order.status,
    'to_status', p_new_status,
    'changed_at', now()
  );
end $$;
