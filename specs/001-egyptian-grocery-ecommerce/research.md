# Phase 0 Research: Egyptian Grocery E-Commerce Platform

**Feature**: `specs/001-egyptian-grocery-ecommerce`
**Date**: 2026-08-13
**Purpose**: Resolve every unknown in the plan's Technical Context before design begins.

---

## R1. Next.js deployment target on Cloudflare

**Decision**: Deploy Next.js 15 (App Router) to **Cloudflare Workers** using the
**`@opennextjs/cloudflare`** adapter, running the **Node.js runtime**, with Workers Static
Assets serving the build output.

**Rationale**:

- `@cloudflare/next-on-pages` is deprecated and locked to the Edge runtime. Building on it
  would be building on a dead path.
- `@opennextjs/cloudflare` is the officially recommended route for Next.js on Cloudflare and
  supports the Node.js runtime, which matters because `@supabase/ssr` and the Postgres client
  path expect Node APIs. Edge-runtime-only would force awkward workarounds.
- The Workers free tier (100,000 requests/day) covers the planned volume with wide headroom:
  3,000 orders/month with generous browsing overhead sits at roughly 1–2% of the allowance.
- Server Components and Server Actions run server-side by default, which is what makes
  Constitution Principle I (server-authoritative pricing) natural rather than bolted on.

**Alternatives considered**:

| Alternative | Rejected because |
|---|---|
| `@cloudflare/next-on-pages` | Deprecated; Edge-runtime only; incompatible with the Supabase server helpers we need. |
| Vercel hosting | Violates Principle V — free tier is generous but the stack was specified as Cloudflare, and commercial use on Vercel's hobby tier is not permitted. |
| Static export + client-only Supabase calls | Fatal to Principle I: pricing would happen in the browser. Also loses server-rendered first paint required by SC-003. |
| Cloudflare Pages (non-Next adapter) | Would require abandoning Next.js. |

**Consequences**: Next.js version is pinned to a range the adapter supports (15.x or 16.x).
Node.js compatibility flags must be enabled in `wrangler.jsonc`. Incremental static
regeneration requires additional Cloudflare bindings and is deliberately not used in v1.

---

## R2. Phone + password authentication without SMS or email

**Problem**: The specification forbids SMS verification and email entirely (FR-008), but
Supabase Auth's providers are email/password, phone/OTP, and OAuth. Phone/OTP requires a paid
SMS gateway. Email/password nominally requires an email address.

**Decision**: Use Supabase Auth's **email/password provider with a synthetic, internal-only
email derived deterministically from the canonical phone number**, with email confirmation
disabled.

- Normalize input to E.164: `+20` followed by the 10-digit mobile number (`01XXXXXXXXX` →
  `+201XXXXXXXXX`). Accept and collapse local, international, spaced and dashed notations
  (FR-009).
- Derive the auth identifier as `<digits>@phone.fmcg.local` — e.g. `+201001234567` →
  `201001234567@phone.fmcg.local`. This is a reserved, non-routable domain; nothing is ever
  sent to it.
- The synthetic address is an implementation detail. It never appears in the UI, never in
  API responses, and users never type it. The sign-in form takes a phone number and the
  server performs the mapping.
- Store the real canonical phone on `profiles.phone` with a unique constraint — that column,
  not the synthetic address, is the business identity.

**Rationale**: This keeps the entire Supabase Auth machinery — bcrypt password hashing, JWT
issuance, refresh-token rotation, session cookies, and `auth.uid()` inside RLS policies —
which is exactly the machinery Principle II depends on. Hand-rolling authentication to avoid
a cosmetic email column would mean hand-rolling password hashing and session security, which
is a far worse trade.

**Alternatives considered**:

| Alternative | Rejected because |
|---|---|
| Supabase phone auth with OTP | Requires a paid SMS provider (Twilio/MessageBird). Violates Principle V and FR-008. |
| Custom auth table with own password hashing and sessions | Loses `auth.uid()`, so every RLS policy would need a bespoke claim mechanism. Large security surface for no benefit. |
| Anonymous auth + phone claim | Leaves accounts unrecoverable and complicates the unique-phone constraint. |
| Collecting a real optional email | Contradicts FR-008 and invites support burden over unverified addresses. |

**Consequences and mitigations**:

- **Email confirmations must be disabled** in the Supabase Auth settings, otherwise signup
  stalls waiting for a confirmation that can never arrive. This is a deployment checklist
  item, not a code concern.
- **No self-service password reset exists.** FR-016 covers this with a staff-mediated reset
  performed through the admin console using the service role, written to the audit trail.
- **Rate limiting** (FR-014) is not provided for this flow by Supabase at the granularity we
  need, so a `login_attempts` table records failures per canonical phone and the sign-in
  action refuses further attempts after a threshold within a window.
- **Enumeration**: sign-in failures return an identical message whether the number is unknown
  or the password is wrong.

---

## R3. Bilingual content modelling

**Decision**: **Denormalized paired columns** — `name_ar` / `name_en`, `description_ar` /
`description_en` — on `products`, `categories`, `brands` and `cities`. Not a separate
translations table.

**Rationale**:

- The language set is closed and fixed at exactly two. The open-ended flexibility a
  translations table buys is flexibility we have explicitly scoped out.
- A listing query stays a single table scan. A translations table would add a join or a
  pivot to every catalog query — the hottest path in the system, and the one SC-003 and SC-004
  put time limits on.
- `NOT NULL` on both columns enforces FR-057 (refuse master data missing a language) directly
  in the schema, where a translations table would need a trigger to achieve the same.
- Admin forms map one-to-one onto columns, which keeps the staff UI simple (Principle VI).

**Alternatives considered**: A `translations(entity_type, entity_id, locale, field, value)`
table — rejected as above. A JSONB `{ar, en}` column per field — rejected because `NOT NULL`
per language cannot be expressed without a check constraint, and indexing individual
languages for search becomes awkward.

**Consequences**: Adding a third language later is a migration adding columns, not a
restructure. Given the fixed Egypt-only scope, that is an acceptable trade.

---

## R4. Interface localization and RTL

**Decision**: `next-intl` with a `[locale]` route segment (`/ar/...`, `/en/...`), Arabic as
the default locale, and **Tailwind CSS v4 using logical properties throughout**.

- `<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>` set in the locale layout, so
  direction is a server-rendered attribute — no flash of wrong direction.
- Layout uses `ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `text-start`/`text-end`.
  Physical `left`/`right` utilities are banned by lint rule, per Principle III.
- Locale preference persists in a cookie; middleware resolves the locale and redirects a
  bare `/` to `/ar`.
- The language switch links to the same pathname under the other locale, preserving the page.
  The cart lives in `localStorage` and is therefore untouched by the switch (FR-003).
- Currency and numerals via `Intl.NumberFormat` with `ar-EG` / `en-EG`; amounts are always
  stored locale-independently as integers (R5).

**Rationale**: `next-intl` is the mature App Router option with server-component support, so
translation happens during server rendering and no dictionary is shipped to the client for
server-rendered text. Tailwind v4 has first-class logical property utilities, making
correct-by-default RTL a matter of using the standard utility names.

**Alternatives considered**: `next-i18next` (Pages Router oriented); a hand-rolled dictionary
(loses pluralization, date and number formatting, and message extraction); CSS `direction`
flipping via a PostCSS transform (fragile, and unnecessary when logical properties exist).

---

## R5. Money representation

**Decision**: All monetary values are **`integer` piastres** (1 EGP = 100 piastres) end to
end — database columns, RPC arguments and returns, API payloads, and client state. Formatting
to "١٢٥٫٥٠ ج.م" happens only at the render boundary.

**Rationale**: Principle I is meaningless if totals drift. Floating point makes
`0.1 + 0.2 ≠ 0.3` a live risk in percentage-discount arithmetic, and a one-piastre discrepancy
between the displayed total and the recorded total is a cash dispute at the door (SC-005).
Integers make the arithmetic exact and comparisons trivially correct.

**Alternatives considered**: `numeric(10,2)` — exact in Postgres, but serializes to
JavaScript `number` through PostgREST and loses that exactness the moment it crosses into the
client. `float8` — rejected outright by Principle V's money clause.

**Consequence**: Percentage discounts round with a single documented rule —
`floor(price * pct / 100)` on the discount amount, so rounding always favours the customer and
never produces a total exceeding the sum of displayed line prices.

---

## R6. Server-authoritative pricing and order placement

**Decision**: A single `SECURITY DEFINER` PL/pgSQL function, `place_order(p_items jsonb,
p_address_id uuid, p_idempotency_key text)`, is the **only** write path that creates an order.
The client sends product IDs and quantities and nothing else.

Inside one transaction the function:

1. Resolves the caller via `auth.uid()`; rejects an anonymous caller (FR-036).
2. Verifies the address belongs to the caller and its city is active (FR-062, edge case).
3. Locks each referenced product row with `SELECT ... FOR UPDATE`, ordered by product id to
   avoid deadlocks between concurrent orders.
4. Re-reads current `price`, `stock_qty`, `min_order_qty`, `is_active` for each product.
5. Resolves the single best active promotion per product via `effective_price()` (R7).
6. Validates stock, minimum quantity, and active status; raises a typed error naming the
   offending product on failure (FR-032, FR-033).
7. Computes line totals, subtotal, total discount; reads the city's `delivery_fee` and
   `min_order_value`; refuses if subtotal is below the minimum, reporting the shortfall
   (FR-031).
8. Inserts the `orders` row, the `order_items` rows carrying the **price snapshot** and a
   copy of the product name and unit (FR-034), the address snapshot including landmark
   (FR-040), and the initial `submitted` history entry (FR-041, FR-046).
9. Decrements `stock_qty` in the same transaction (FR-043).

**Rationale**: Putting the whole computation behind one database function means there is no
code path — no future admin script, no forgotten route, no client fetch — that can create an
order at a price the database did not compute. Atomicity (FR-037) comes free from the
transaction. Row locks give SC-016 (exactly one winner for the last unit) without an
application-level lock service.

**Idempotency** (FR-038): a `UNIQUE` constraint on `orders.idempotency_key`. The client
generates a key when the checkout page mounts and sends it with the submission; a repeat
submission hits the constraint and the function returns the existing order rather than
creating a second one.

**Alternatives considered**: Computing in a Next.js Server Action with the service role —
rejected because correctness would then depend on every future caller remembering to use that
one function, and because the read-validate-write window would need explicit locking anyway.
Database triggers computing totals on insert — rejected as harder to test and to return
meaningful validation errors from.

**Preview endpoint**: `price_cart(p_items jsonb, p_city_id uuid)` — a `STABLE` function
sharing the same pricing logic — serves the cart and checkout display. Because both paths call
the same underlying pricing, the displayed total and the recorded total cannot diverge
(SC-005), and FR-035 is satisfied by diffing the preview shown against the placement result.

---

## R7. Promotion resolution

**Decision**: A `promotions` table with `discount_type` (`percent` | `fixed`), `discount_value`,
`starts_at`, `ends_at`, `is_active`, and a scope expressed as exactly one of `product_id`,
`category_id`, `brand_id`, or none (meaning catalog-wide), enforced by a check constraint.
Resolution happens in an `effective_price(product_id, at timestamptz)` SQL function.

Resolution rules:

- Consider only promotions where `is_active` and `at BETWEEN starts_at AND ends_at` (FR-028).
- Among all eligible promotions for a product, compute each one's resulting price and take
  the **lowest** — the most favourable to the customer (FR-027). Discounts never stack.
- Clamp the result at zero (FR-029).
- Category scope matches the product's category **and its ancestors**, so a promotion on
  "Dairy" reaches products in "Dairy › Yoghurt".

A `product_pricing` view exposes `product_id, base_price, effective_price, discount_amount,
promotion_id` for listing queries so the storefront gets prices in the same round trip as the
products.

**Rationale**: Time-bounded evaluation at query time means expiry needs no scheduled job — a
promotion simply stops matching (Story 3, scenario 4). Taking the minimum is both
customer-favourable and deterministic under overlap, which the ambiguous "create promotions
with a discount" requirement otherwise left open.

**Alternatives considered**: A precomputed `current_price` column maintained by a cron job —
rejected because it introduces a window where the stored price is wrong, which Principle I
forbids. Priority-ranked promotions — rejected as staff-facing complexity for no stated need.

---

## R8. Row Level Security design

**Decision**: RLS enabled on every table, with helper functions `is_staff()` and `is_admin()`
reading the caller's role from `profiles`, both `SECURITY DEFINER` and `STABLE` to avoid
recursive policy evaluation.

| Table | Customer | Staff | Admin |
|---|---|---|---|
| `profiles` | own row (read/update) | read all | read/write all |
| `addresses` | own rows (full) | read all | read all |
| `orders` | own rows (read); insert only via `place_order`; update only own `submitted` → `cancelled` | read all, transition via RPC | read all |
| `order_items` | read where parent order is own | read all | read all |
| `order_status_history` | read where parent order is own; no insert/update/delete | read all; insert via RPC only | read all |
| `products`, `categories`, `brands` | read where `is_active` | read all | full write |
| `product_costs` | **no grant at all** | **no grant at all** | full |
| `cities` | read where `is_active` | read all | full write |
| `promotions` | read where active and in window | read all | full write |

**Cost price isolation** (FR-063, SC-008): cost lives in a separate `product_costs` table
rather than a column on `products`. A column would rely on every query remembering to omit it,
and on PostgREST column-level grants being configured correctly forever; a separate table with
no grant for the `authenticated` role means a customer asking for cost data receives an error,
not a value. This is the difference between a policy and a guarantee, and Principle II demands
the guarantee.

**Order status history immutability** (FR-047): no `UPDATE` or `DELETE` policy exists for any
role, and inserts happen only inside the `SECURITY DEFINER` transition function. There is no
route by which a row can be altered.

**Rationale**: Principle II requires that a forgotten application check still returns nothing.
Every isolation guarantee therefore lives in a policy, and the application-layer checks exist
purely so users get a clean "not allowed" screen instead of an empty one.

---

## R9. Order status transitions

**Decision**: A Postgres enum `order_status` and a `SECURITY DEFINER` function
`set_order_status(p_order_id uuid, p_new_status order_status, p_note text)` holding the
transition table:

```
submitted        → confirmed, cancelled
confirmed        → preparing, cancelled
preparing        → out_for_delivery, cancelled
out_for_delivery → delivered
delivered        → returned
cancelled        → (terminal)
returned         → (terminal)
```

Authorization inside the function: staff may perform any legal transition; a customer may
perform only `submitted → cancelled` on an order they own (FR-048). Every accepted transition
appends to `order_status_history` in the same transaction (FR-046).

**Concurrency** (FR-050): the function takes `SELECT ... FOR UPDATE` on the order row and
re-reads the current status inside the lock, so a simultaneous customer cancel and staff
confirm serialize — the second one finds a status its transition is not legal from and is
refused with a message saying the order has already moved on.

**Rationale**: Encoding the table in the database rather than the admin UI means the guarantee
holds against any client, including a future mobile app or a staff member with API access
(Principle VII).

---

## R10. Arabic and English search

**Decision**: `pg_trgm` trigram indexing over a normalized, generated search column — not
`tsvector` full-text search.

Postgres ships no Arabic stemming dictionary; a `to_tsvector('arabic', ...)` configuration
does not exist, and `simple` gives exact-token matching only, which fails on the prefix
searches shoppers actually type.

The design:

- A `search_normalize(text)` immutable function that lowercases, strips Arabic diacritics
  (tashkeel, `U+064B`–`U+0652`) and tatweel (`U+0640`), and folds orthographic variants that
  Egyptian shoppers type interchangeably: `أ إ آ ٱ → ا`, `ة → ه`, `ى → ي`, `ؤ → و`, `ئ → ي`.
  Without this folding, a search for `مياه` misses a product stored as `مياة`.
- A generated column `search_text` concatenating normalized `name_ar`, `name_en`,
  `description_ar`, `description_en` and the brand names.
- A GIN index using `gin_trgm_ops` over `search_text`, queried with `%` similarity and
  `ILIKE` prefix matching.

**Rationale**: Trigram matching is language-agnostic, tolerates the spelling variation that
Arabic input invites, and handles partial words — which covers FR-019 for both languages with
one index. At a 2,000-product catalog the index is small and query latency stays far inside
SC-004's one-second budget.

**Alternatives considered**: `tsvector` with the `simple` configuration — no prefix or fuzzy
matching, fails on Arabic orthographic variants. An external search service (Algolia,
Typesense) — violates Principle V. Client-side filtering of a downloaded catalog — violates
Principle IV, shipping the whole catalog over metered mobile data.

---

## R11. Cart persistence

**Decision**: The cart lives in the browser's `localStorage` as `{product_id, qty}` pairs
only — **never prices**. Every render of the cart or checkout calls `price_cart()` on the
server for current prices, totals and fee.

**Rationale**: Storing no prices client-side makes tampering structurally pointless, which is
the cleanest possible expression of FR-026 — there is nothing to tamper with. It costs zero
database rows and zero writes, which matters against the 500 MB free-tier ceiling. It survives
browser restart (FR-024) and survives the language switch untouched (FR-003), because a
locale change is a navigation, not a storage event.

**Alternatives considered**: A server-side `carts` table — rejected for v1: it adds write
volume and storage for a feature (cart sync across devices) nobody asked for, and it makes an
anonymous shopper's cart require either a session row or an anonymous auth user. A cookie —
rejected because a large cart would bloat every request header, which Principle IV penalizes
on metered connections.

**Consequence**: Carts do not follow a customer between devices. Accepted for v1; a server
cart can be added later without changing the pricing contract, since prices never lived in the
cart anyway.

---

## R12. Product images

**Decision**: A Supabase Storage bucket `product-images`, public read, admin write, fronted by
Cloudflare's cache. Uploads are **resized and re-encoded in the browser before upload**.

- The admin upload control draws the selected file to a canvas, resizes the longest edge to
  1200px, and encodes to WebP at quality 0.82 before sending. A typical 4 MB phone photo
  becomes roughly 120–180 KB.
- At 2,000 products × 3 photos × ~150 KB ≈ 900 MB, which sits against a 1 GB free-tier
  ceiling. The upload path therefore also emits a 400px thumbnail used by listings, and the
  budget is monitored — see the operational note below.
- Storefront `<Image>` usage sets explicit dimensions, `loading="lazy"` below the fold, and
  `sizes` matched to the mobile-first grid (FR-068, Principle IV).

**Operational note**: the storage budget is the tightest free-tier constraint in the system. At
1,200 products it is comfortable; approaching 2,000 products with three photos each it becomes
marginal. Mitigations in priority order: cap at 4 photos per product, keep the 1200px longest
edge, and reclaim orphans with a scheduled sweep of storage objects no `product_photos` row
references.

**Alternatives considered**: Cloudflare Images — a paid product, violates Principle V. Storing
originals and transforming on request — Supabase image transformations are a paid feature.
Server-side resizing in a Worker — CPU-time limits on the free tier make large image decoding
unreliable, and the browser has already done the work for free.

---

## R13. Free-tier operational constraints

**Supabase free tier**: 500 MB database, 1 GB storage, 50,000 monthly active users, 5 GB
egress, 2 active projects, **and automatic pausing after 7 days with no API requests**. No
backups.

- **Pausing** (FR-069): a Cloudflare Cron Trigger runs every 6 hours and issues one trivial
  authenticated query. This costs nothing and keeps the project awake through quiet periods.
- **Database size**: the planned volume — 2,000 products, 1,000 customers, 3,000 orders/month
  with roughly 8 lines each — is on the order of tens of megabytes per year. Comfortable.
- **No backups on the free tier** is a genuine risk the constitution's cost constraint imposes.
  Mitigation: a scheduled `pg_dump`-equivalent export of the master data and orders to a
  Cloudflare R2 bucket or a repository artifact, weekly. Flagged in the plan as a task, and
  called out to the business owner as the one place where "free" carries real exposure.

**Cloudflare Workers free tier**: 100,000 requests/day, 10 ms CPU per invocation, and Cron
Triggers included. The CPU ceiling is the one to respect — it rules out image processing and
heavy server-side computation in a request, both of which this design already avoids.

---

## R14. Order reference format

**Decision**: A human-readable reference of the form `EG-YYMMDD-NNNN`, where `NNNN` is a
daily sequence, generated in the database and stored on the order with a unique constraint.

**Rationale**: FR-039 exists because staff read these numbers aloud over the phone to
customers, in Arabic, on a bad line. A UUID is unusable for that. The date prefix lets staff
locate an order in the queue without a lookup, and the short suffix is easy to read back.
Latin digits and hyphens read unambiguously in both languages.

---

## R15. Testing strategy

**Decision**: Testing effort concentrates on the four areas the constitution names as
money-or-data critical, with lighter coverage elsewhere.

| Area | Approach |
|---|---|
| Pricing engine (`effective_price`, `price_cart`) | pgTAP-style SQL assertions covering promotion windows, overlap, percentage rounding, zero clamping, category-ancestor scope. |
| Order placement (`place_order`) | Integration tests against a local Supabase instance: happy path, stock exhaustion, minimum quantity, city minimum, idempotent replay, and a concurrent last-unit race. |
| Status transitions (`set_order_status`) | Table-driven test asserting every legal transition succeeds and every illegal one is refused, plus the customer-cancel authorization boundary and the simultaneous-transition race. |
| RLS isolation | Tests running as two distinct customer JWTs and one staff JWT, asserting cross-customer reads return zero rows and that `product_costs` is unreachable for both non-admin roles. |
| UI | Playwright smoke tests for the register → browse → cart → order journey in Arabic at a 360px viewport, plus an RTL layout assertion (no horizontal overflow). |

**Rationale**: Principle "Testing posture" mandates exactly these four, and SC-005 through
SC-008, SC-011 and SC-016 are only verifiable with them. Broad unit coverage of presentational
components would consume effort without protecting money or data.

---

## R16. Admin authorization layering

**Decision**: Three roles on `profiles.role` — `customer`, `staff`, `admin`.

- `customer`: storefront only.
- `staff`: order queue and status transitions; read-only catalog.
- `admin`: everything, including prices, promotions, cities, cost data, and staff account
  management.

Enforcement is layered: middleware redirects non-staff away from `/admin` for a clean user
experience; Server Components re-check on every request; and RLS refuses the data regardless
(FR-064, FR-065). The middleware check is a convenience, never the boundary.

**Rationale**: FR-060 requires that ordinary staff can process orders without seeing cost
prices. Two levels is the minimum that satisfies it; more would be unjustified complexity for
a single-warehouse operation.

---

## Resolved unknowns summary

| Unknown from Technical Context | Resolution |
|---|---|
| Cloudflare deployment adapter | `@opennextjs/cloudflare`, Workers, Node runtime (R1) |
| Phone auth without SMS/email | Synthetic internal email over Supabase Auth email/password (R2) |
| Bilingual data shape | Paired columns, `NOT NULL` both languages (R3) |
| RTL mechanism | `next-intl` + Tailwind logical properties, `dir` server-rendered (R4) |
| Money type | Integer piastres throughout (R5) |
| Server-authoritative totals | Single `SECURITY DEFINER` `place_order` transaction (R6) |
| Promotion overlap and expiry | Lowest resulting price, evaluated at query time (R7) |
| Cost price isolation | Separate `product_costs` table with no non-admin grant (R8) |
| Transition enforcement | Enum + transition table inside `set_order_status` (R9) |
| Arabic search | `pg_trgm` over a diacritic- and variant-normalized generated column (R10) |
| Cart storage | `localStorage`, IDs and quantities only (R11) |
| Image budget | Browser-side resize to WebP before upload (R12) |
| Free-tier pausing | 6-hourly Cloudflare Cron keep-alive (R13) |
| Order reference | `EG-YYMMDD-NNNN`, database-generated (R14) |
| Test focus | Pricing, placement, transitions, RLS (R15) |
| Staff levels | `customer` / `staff` / `admin` (R16) |

**Status**: No NEEDS CLARIFICATION items remain. Ready for Phase 1 design.

---

## Sources

- [Next.js · Cloudflare Workers docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [OpenNext — Cloudflare adapter](https://opennext.js.org/cloudflare)
- [Deploying Next.js apps to Cloudflare Workers with the OpenNext adapter](https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter)
- [cloudflare/next-on-pages (deprecated)](https://github.com/cloudflare/next-on-pages)
- [Supabase Free Tier Limits in 2026](https://www.itpathsolutions.com/supabase-free-tier-limits)
- [Supabase Pricing in 2026: Plans, Free Tier Limits & Full Breakdown](https://uibakery.io/blog/supabase-pricing)
