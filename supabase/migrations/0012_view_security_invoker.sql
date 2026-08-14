-- 0012 — Make the pricing view run as its caller
--
-- A Postgres view executes with the privileges of its OWNER unless
-- `security_invoker` is set. `product_pricing` is owned by `postgres`, which
-- carries BYPASSRLS — so the view's own scan of `products` was not subject to
-- Row Level Security at all.
--
-- In practice it still returned nothing for an inactive product, but only by
-- accident: the view cross-joins `effective_price()`, which is a SECURITY
-- INVOKER function and therefore re-reads `products` as the caller. With no
-- visible row, the lateral produced no rows and the outer row fell away.
--
-- That is an emergent behaviour, not a guarantee. It would break the moment
-- someone made `effective_price()` a definer function, or selected a column
-- straight from the outer scan. Constitution Principle II asks for isolation
-- that holds because of how the system is built, not because of how two
-- unrelated details happen to interact today.
--
-- With `security_invoker = true` the entire view runs as the caller, and the
-- policies on `products` apply to it exactly as they apply to the table.

alter view public.product_pricing set (security_invoker = true);

comment on view public.product_pricing is
  'Current price per product, evaluated at now(). security_invoker=true, so RLS on products applies to the caller — never stored, never owner-privileged.';
