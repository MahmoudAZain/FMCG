-- 0010 — Bilingual product search
--
-- Trigram matching over normalised text, not tsvector. Postgres ships no Arabic
-- dictionary, and `simple` gives exact-token matching only — which fails on the
-- partial words shoppers actually type (research R10).

-- The generated column covers the product's own text. Brand names live in
-- another table and so cannot appear in a generated column; search_products()
-- joins brands instead, which also keeps a brand rename from needing a
-- backfill.
alter table public.products
  add column search_text text
  generated always as (
    public.search_normalize(
      coalesce(name_ar, '') || ' ' ||
      coalesce(name_en, '') || ' ' ||
      coalesce(description_ar, '') || ' ' ||
      coalesce(description_en, '') || ' ' ||
      coalesce(sku, '')
    )
  ) stored;

create index products_search_trgm_idx
  on public.products using gin (search_text extensions.gin_trgm_ops);

create index brands_search_trgm_idx
  on public.brands using gin (
    (public.search_normalize(name_ar || ' ' || name_en)) extensions.gin_trgm_ops
  );

-- ---------------------------------------------------------------------------
-- search_products — one entry point for both languages
--
-- Matches the product's own text or its brand. Prefix matching handles the
-- partial words people type; similarity handles the spelling variation Arabic
-- invites even after normalisation.
-- ---------------------------------------------------------------------------
create or replace function public.search_products(
  p_query  text,
  p_limit  integer default 40,
  p_offset integer default 0
)
returns setof public.products
language sql
stable
set search_path = public
as $$
  select p.*
  from public.products p
  left join public.brands b on b.id = p.brand_id
  where p.is_active
    and (
      p.search_text like '%' || public.search_normalize(p_query) || '%'
      or public.search_normalize(coalesce(b.name_ar, '') || ' ' || coalesce(b.name_en, ''))
         like '%' || public.search_normalize(p_query) || '%'
    )
  order by
    -- Exact prefix matches first: someone typing "لبن" wants milk, not a
    -- product that merely mentions it in a description.
    (p.search_text like public.search_normalize(p_query) || '%') desc,
    p.name_ar
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0)
$$;

grant execute on function public.search_products(text, integer, integer) to anon, authenticated;
