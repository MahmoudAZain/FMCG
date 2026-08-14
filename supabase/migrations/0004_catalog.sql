-- 0004 — Categories, brands, products and product photos
--
-- Bilingual fields are paired NOT NULL columns rather than a translations
-- table (research R3). That makes FR-057 — refuse master data missing a
-- language — a schema constraint instead of a form validation.

-- ---------------------------------------------------------------------------
-- Categories: a hierarchy at least two levels deep (FR-018)
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories (id) on delete restrict,
  name_ar     text        not null,
  name_en     text        not null,
  slug        text        not null,
  image_path  text,
  sort_order  integer     not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint categories_name_ar_present check (char_length(btrim(name_ar)) > 0),
  constraint categories_name_en_present check (char_length(btrim(name_en)) > 0),
  constraint categories_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id)
);

create unique index categories_slug_key on public.categories (slug);
create index categories_parent_idx on public.categories (parent_id, sort_order) where is_active;

create trigger categories_touch_updated_at
  before update on public.categories
  for each row execute function public.touch_updated_at();

-- A cycle would make promotion-ancestor resolution and breadcrumbs loop
-- forever. Depth is capped so both stay bounded.
create or replace function public.guard_category_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cursor_id uuid := new.parent_id;
  depth     integer := 0;
begin
  while cursor_id is not null loop
    depth := depth + 1;

    if cursor_id = new.id then
      raise exception 'category_cycle: a category may not be its own ancestor'
        using errcode = '23514';
    end if;

    if depth > 3 then
      raise exception 'category_too_deep: categories may nest at most 3 levels'
        using errcode = '23514';
    end if;

    select parent_id into cursor_id from public.categories where id = cursor_id;
  end loop;

  return new;
end $$;

create trigger categories_guard_hierarchy
  before insert or update of parent_id on public.categories
  for each row execute function public.guard_category_hierarchy();

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
create table public.brands (
  id         uuid primary key default gen_random_uuid(),
  name_ar    text        not null,
  name_en    text        not null,
  slug       text        not null,
  logo_path  text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint brands_name_ar_present check (char_length(btrim(name_ar)) > 0),
  constraint brands_name_en_present check (char_length(btrim(name_en)) > 0),
  constraint brands_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create unique index brands_slug_key on public.brands (slug);

create trigger brands_touch_updated_at
  before update on public.brands
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Products — every attribute the business listed in FR-051
-- ---------------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  category_id      uuid        not null references public.categories (id) on delete restrict,
  brand_id         uuid references public.brands (id) on delete restrict,

  name_ar          text        not null,
  name_en          text        not null,
  description_ar   text,
  description_en   text,
  slug             text        not null,

  -- Piastres. The selling price; cost lives in a separate table nobody but an
  -- admin can reach (0005).
  price            integer     not null,

  unit             public.unit_type    not null,
  pack_size        text,
  units_per_carton integer,
  weight_grams     integer,
  barcode          text,
  sku              text        not null,
  stock_qty        integer     not null default 0,
  min_order_qty    integer     not null default 1,
  storage          public.storage_type not null default 'ambient',
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint products_name_ar_length check (char_length(btrim(name_ar)) between 2 and 200),
  constraint products_name_en_length check (char_length(btrim(name_en)) between 2 and 200),
  constraint products_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- A zero price is a data-entry mistake, not a giveaway.
  constraint products_price_positive check (price > 0),

  -- The last line of defence behind the place_order transaction: a concurrent
  -- decrement that would oversell aborts here rather than going negative
  -- (SC-016).
  constraint products_stock_non_negative check (stock_qty >= 0),

  constraint products_min_order_positive check (min_order_qty > 0),
  constraint products_units_per_carton_positive check (units_per_carton is null or units_per_carton > 0),
  constraint products_weight_positive check (weight_grams is null or weight_grams > 0),
  constraint products_pack_size_length check (pack_size is null or char_length(pack_size) <= 40)
);

create unique index products_slug_key on public.products (slug);
create unique index products_sku_key on public.products (upper(sku));

-- Loose produce has no barcode, so the column is nullable — but a barcode that
-- does exist must identify exactly one product.
create unique index products_barcode_key on public.products (barcode) where barcode is not null;

create index products_category_idx on public.products (category_id) where is_active;
create index products_brand_idx on public.products (brand_id) where is_active;

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

comment on column public.products.price is 'Piastres. 4500 = 45.00 EGP.';
comment on column public.products.min_order_qty is
  'Wholesale minimum. place_order() refuses a smaller quantity (FR-032).';

-- ---------------------------------------------------------------------------
-- Product photos
-- ---------------------------------------------------------------------------
create table public.product_photos (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid        not null references public.products (id) on delete cascade,
  storage_path text        not null,
  thumb_path   text,
  alt_ar       text,
  alt_en       text,
  sort_order   integer     not null default 0,
  is_primary   boolean     not null default false,
  created_at   timestamptz not null default now()
);

create index product_photos_product_idx on public.product_photos (product_id, sort_order);
create unique index product_photos_one_primary
  on public.product_photos (product_id) where is_primary;

-- Storage is the tightest free-tier constraint in the system: 2,000 products at
-- four photos each already approaches the 1 GB ceiling (research R12). The cap
-- is enforced here so no admin screen can quietly exceed it.
create or replace function public.guard_product_photo_count()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  existing integer;
begin
  select count(*) into existing
  from public.product_photos
  where product_id = new.product_id;

  if existing >= 4 then
    raise exception 'too_many_photos: a product may have at most 4 photos'
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger product_photos_guard_count
  before insert on public.product_photos
  for each row execute function public.guard_product_photo_count();
