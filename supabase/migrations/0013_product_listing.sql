-- 0013 — One view behind every product listing
--
-- A listing needs the product, its current price, its primary photo, its
-- category and its brand. Fetching those separately would be four round trips
-- from a Worker to Supabase on every category page — the slowest thing in the
-- system on Egyptian mobile data, and the one SC-003 puts a 3-second limit on.
--
-- `security_invoker = true` is not optional here. Without it the view would run
-- with its owner's rights and show inactive products to anonymous visitors
-- (see migration 0012).

create or replace view public.product_listing
with (security_invoker = true) as
select
  p.id,
  p.slug,
  p.name_ar,
  p.name_en,
  p.description_ar,
  p.description_en,
  p.unit,
  p.pack_size,
  p.units_per_carton,
  p.weight_grams,
  p.storage,
  p.stock_qty,
  p.min_order_qty,
  p.is_active,
  p.category_id,
  p.brand_id,

  ep.base_price,
  ep.effective_price,
  ep.discount_amount,
  ep.promotion_id,

  -- The primary photo, or the first by sort order if none is marked primary.
  ph.storage_path as photo_path,

  c.slug    as category_slug,
  c.name_ar as category_name_ar,
  c.name_en as category_name_en,

  b.slug    as brand_slug,
  b.name_ar as brand_name_ar,
  b.name_en as brand_name_en

from public.products p
cross join lateral public.effective_price(p.id, now()) ep
left join lateral (
  select pp.storage_path
  from public.product_photos pp
  where pp.product_id = p.id
  order by pp.is_primary desc, pp.sort_order
  limit 1
) ph on true
join public.categories c on c.id = p.category_id
left join public.brands b on b.id = p.brand_id;

grant select on public.product_listing to anon, authenticated;

comment on view public.product_listing is
  'Product, current price, primary photo, category and brand in one read. security_invoker=true so RLS applies to the caller.';

-- ---------------------------------------------------------------------------
-- descendant_categories — a category and everything filed beneath it
--
-- Opening "Dairy" should show the yoghurt too, not an empty shelf with three
-- subcategory links (FR-018).
-- ---------------------------------------------------------------------------
create or replace function public.descendant_categories(p_category_id uuid)
returns table (category_id uuid)
language sql
stable
set search_path = public
as $$
  with recursive tree as (
    select id from public.categories where id = p_category_id
    union all
    select c.id
    from public.categories c
    join tree on c.parent_id = tree.id
  )
  select id from tree
$$;

grant execute on function public.descendant_categories(uuid) to anon, authenticated;
