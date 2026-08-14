-- 0006 — Promotions and the pricing engine
--
-- Prices are resolved at query time, never precomputed into a column. A stored
-- "current price" would have a window in which it is wrong, and Constitution
-- Principle I does not allow that. It also means expiry needs no scheduled job:
-- a promotion simply stops matching (research R7).

create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  name_ar        text        not null,
  name_en        text        not null,
  discount_type  public.discount_type not null,

  -- percent: 1-100. fixed: piastres off.
  discount_value integer     not null,

  starts_at      timestamptz not null,
  ends_at        timestamptz not null,

  -- Scope: exactly one of these, or none for catalog-wide.
  product_id     uuid references public.products (id) on delete cascade,
  category_id    uuid references public.categories (id) on delete cascade,
  brand_id       uuid references public.brands (id) on delete cascade,

  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint promotions_name_ar_present check (char_length(btrim(name_ar)) > 0),
  constraint promotions_name_en_present check (char_length(btrim(name_en)) > 0),
  constraint promotions_window_ordered check (ends_at > starts_at),
  constraint promotions_value_positive check (discount_value > 0),
  constraint promotions_percent_bounded check (
    discount_type <> 'percent' or discount_value between 1 and 100
  ),
  constraint promotions_single_scope check (
    num_nonnulls(product_id, category_id, brand_id) <= 1
  )
);

create index promotions_window_idx on public.promotions (starts_at, ends_at) where is_active;
create index promotions_product_idx on public.promotions (product_id) where product_id is not null;
create index promotions_category_idx on public.promotions (category_id) where category_id is not null;
create index promotions_brand_idx on public.promotions (brand_id) where brand_id is not null;

create trigger promotions_touch_updated_at
  before update on public.promotions
  for each row execute function public.touch_updated_at();

comment on constraint promotions_single_scope on public.promotions is
  'A promotion targets one product, one category, one brand, or the whole catalog — never a combination.';

-- ---------------------------------------------------------------------------
-- category_ancestors — a category and every category above it
--
-- A promotion on "Dairy" must reach products in "Dairy > Yoghurt", so scope
-- matching walks upward from the product's own category (research R7).
-- ---------------------------------------------------------------------------
create or replace function public.category_ancestors(p_category_id uuid)
returns table (category_id uuid)
language sql
stable
set search_path = public
as $$
  with recursive chain as (
    select id, parent_id from public.categories where id = p_category_id
    union all
    select c.id, c.parent_id
    from public.categories c
    join chain on c.id = chain.parent_id
  )
  select id from chain
$$;

-- ---------------------------------------------------------------------------
-- effective_price — the single source of every price the customer sees
--
-- Both price_cart() and place_order() call this, which is what makes the
-- displayed total and the recorded total incapable of diverging (SC-005).
-- ---------------------------------------------------------------------------
create or replace function public.effective_price(
  p_product_id uuid,
  p_at         timestamptz default now()
)
returns table (
  base_price      integer,
  effective_price integer,
  discount_amount integer,
  promotion_id    uuid
)
language sql
stable
set search_path = public
as $$
  with product as (
    select p.id, p.price, p.category_id, p.brand_id
    from public.products p
    where p.id = p_product_id
  ),
  candidates as (
    select
      promo.id as promo_id,
      -- Percentage discounts floor the *discount*, so rounding always favours
      -- the customer and the total can never exceed the sum of displayed
      -- line prices (research R5).
      greatest(
        0,
        product.price - case promo.discount_type
          when 'percent' then floor(product.price * promo.discount_value / 100.0)::integer
          else promo.discount_value
        end
      ) as candidate_price
    from public.promotions promo
    cross join product
    where promo.is_active
      and p_at between promo.starts_at and promo.ends_at
      and (
        promo.product_id = product.id
        or promo.brand_id = product.brand_id
        or promo.category_id in (select category_id from public.category_ancestors(product.category_id))
        or num_nonnulls(promo.product_id, promo.category_id, promo.brand_id) = 0
      )
  ),
  -- Exactly one promotion applies: the one most favourable to the customer.
  -- Discounts never compound (FR-027).
  best as (
    select promo_id, candidate_price
    from candidates
    order by candidate_price asc, promo_id asc
    limit 1
  )
  select
    product.price                                          as base_price,
    coalesce(best.candidate_price, product.price)          as effective_price,
    product.price - coalesce(best.candidate_price, product.price) as discount_amount,
    best.promo_id                                          as promotion_id
  from product
  left join best on true
$$;

-- ---------------------------------------------------------------------------
-- product_pricing — listings join this so prices arrive in the same round trip
-- ---------------------------------------------------------------------------
create or replace view public.product_pricing as
  select
    p.id as product_id,
    ep.base_price,
    ep.effective_price,
    ep.discount_amount,
    ep.promotion_id
  from public.products p
  cross join lateral public.effective_price(p.id, now()) ep;

comment on view public.product_pricing is
  'Current price per product, evaluated at now(). Never stored — a cached price has a window in which it is wrong.';
