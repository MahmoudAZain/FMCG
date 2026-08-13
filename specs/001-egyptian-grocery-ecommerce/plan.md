# Implementation Plan: Egyptian Grocery E-Commerce Platform

**Branch**: `claude/egyptian-grocery-ecommerce-ak98ny` | **Date**: 2026-08-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-egyptian-grocery-ecommerce/spec.md`

## Summary

A bilingual (Arabic-default, RTL) grocery storefront and staff admin console for the Egyptian
market, capturing cash-on-delivery orders for an in-house fleet. Customers register with a
phone number and password — no SMS, no email — browse a bilingual catalog, and place orders
whose every price is computed by the database. Staff run the catalog, promotions and delivery
cities from the admin console and move orders through a fixed lifecycle with a tamper-proof
audit trail.

**Technical approach**: Next.js 15 App Router deployed to Cloudflare Workers via
`@opennextjs/cloudflare`, with Supabase providing Postgres, Auth and Storage. The architectural
centre of gravity is deliberately in the database: pricing, order placement and status
transitions are `SECURITY DEFINER` Postgres functions, and every isolation guarantee is a Row
Level Security policy rather than an application check. Orders have no `INSERT` policy at all —
the only way one comes into existence is through `place_order()`, which recomputes every
amount from stored data. That single decision is what makes "totals are never trusted from the
browser" a structural property instead of a rule someone has to remember.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 22 toolchain, PostgreSQL 15 (Supabase),
PL/pgSQL

**Primary Dependencies**: Next.js 15 (App Router, React 19) · `@opennextjs/cloudflare` ·
`@supabase/supabase-js` + `@supabase/ssr` · `next-intl` · Tailwind CSS v4 · Zod ·
`react-hook-form` · Supabase CLI (local dev and migrations)

**Storage**: Supabase Postgres (500 MB free tier) for all relational data; Supabase Storage
(1 GB) for product imagery in a `product-images` bucket; browser `localStorage` for the cart
(identifiers and quantities only — never prices)

**Testing**: Vitest for unit and Server Action tests · SQL integration tests against a local
Supabase instance for pricing, placement, transitions, RLS, report accuracy and margin isolation ·
Playwright for the register → browse → cart → order journey in Arabic at 360px

**Target Platform**: Cloudflare Workers (Node.js runtime, Workers Static Assets). Clients are
mid-range Android and iOS phones on Egyptian mobile data; current desktop browsers secondary.

**Project Type**: Web application — a single Next.js app containing both the storefront and the
admin console, plus a versioned SQL migration set.

**Performance Goals**: Category listing readable within 3s on a mid-range Android over typical
Egyptian mobile data (SC-003) · 95% of searches under 1s (SC-004) · initial JS payload for the
storefront under 150 KB compressed · LCP under 2.5s on the product listing

**Constraints**: Zero monthly infrastructure cost at 1,000 customers / 2,000 products / 3,000
orders per month (SC-014) · Workers free tier: 100k requests/day and **10 ms CPU per
invocation**, which rules out server-side image processing · Supabase free tier: 500 MB
database, 1 GB storage, **no backups**, and **pausing after 7 idle days** · no horizontal
overflow at a 360px viewport in either direction (SC-012) · all money as integer piastres

**Scale/Scope**: ~2,000 products · ~1,000 registered customers · ~3,000 orders/month · 13
storefront routes · 17 admin routes · 15 tables · 6 transactional database functions · 10 report
functions

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| # | Principle | Design response | Status |
|---|---|---|---|
| I | Server-Authoritative Commerce | `orders` has **no INSERT policy for any role**; `place_order()` is `SECURITY DEFINER` and the sole creation path. It re-reads price, stock and promotions under row locks and computes every amount. `price_cart()` shares that pricing path, so display and record cannot diverge. Client payloads carry only `{product_id, qty}`. | **PASS** |
| II | Tenant-of-One Data Isolation | RLS enabled on all 15 tables. Cross-customer access blocked by `USING (profile_id = auth.uid())` with matching `WITH CHECK`. Cost prices live in a separate `product_costs` table with **no grant** to `anon`, `customer` or `staff`. `order_status_history` has no write policy for any role. Margin reporting lives in separate admin-only functions that raise for other roles, because exports serialize whatever the query returned. 24-assertion RLS test matrix in [contracts/rls-policies.md](contracts/rls-policies.md). | **PASS** |
| III | Bilingual & RTL by Construction | Paired `_ar`/`_en` columns, both `NOT NULL`, so the database refuses half-translated master data. `next-intl` with a locale segment; `dir` server-rendered on `<html>`. Tailwind logical properties only, enforced by lint rule. Language switch preserves cart (`localStorage`) and position. | **PASS** |
| IV | Mobile-First on Egyptian Mobile Data | 360px-first design; server-rendered first paint; WebP imagery resized in-browser to 1200px with 400px thumbs; lazy loading below the fold; 44px touch targets; JS budget under 150 KB compressed. | **PASS** |
| V | Zero-Cost Operations | Supabase + Cloudflare free tiers only. No SMS gateway, no email provider, no payment gateway, no image CDN, no external search service. Cron keep-alive prevents free-tier pausing. Storage bounded by client-side resizing and a 4-photo cap. | **PASS — with one flagged risk, below** |
| VI | Staff Autonomy Over Master Data | 17 admin routes cover products, categories, brands, promotions, cities, staff, the dashboard and reports. Every field in FR-051 is form-editable. Validation is duplicated into database constraints so a staff mistake cannot corrupt data. | **PASS** |
| VII | Auditable Order Lifecycle | Transition table enforced inside `set_order_status()`, not in the UI. Every accepted transition appends a history row with actor and timestamp. No `UPDATE`/`DELETE` policy on history for anyone, including admin. Row locks resolve simultaneous customer-cancel and staff-confirm. | **PASS** |

**Post-Phase-1 re-evaluation**: no principle was weakened by the design. Two points strengthened
during design: cost isolation moved from a column with restricted grants to a separate table
(Principle II), and the privilege-escalation trigger on `profiles` was added after noticing that
RLS alone cannot restrict *which columns* a permitted `UPDATE` touches — without it, any
customer could have set `role = 'admin'` on their own row.

**Flagged risk against Principle V**: the Supabase free tier provides **no backups**. This is a
genuine exposure that the zero-cost constraint imposes, not an oversight. Mitigation is a
weekly export job (T117), but the business owner should know that a catastrophic data loss on
the free tier is recoverable only to the last export. If order history ever becomes
business-critical, the $25/month Pro tier buys point-in-time recovery — that is a business
decision, and this plan does not make it silently.

No entries are required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-egyptian-grocery-ecommerce/
├── spec.md                        # Feature specification
├── plan.md                        # This file
├── research.md                    # Phase 0: 20 resolved decisions
├── data-model.md                  # Phase 1: schema, RLS summary, transitions
├── quickstart.md                  # Phase 1: setup and validation guide
├── tasks.md                       # Phase 2 (/speckit-tasks)
├── checklists/
│   └── requirements.md            # Spec quality checklist
└── contracts/
    ├── rpc-contracts.md           # Database functions + Server Action contracts
    ├── rls-policies.md            # Full policy SQL + 24-assertion verification matrix
    ├── reporting-contracts.md     # Report functions, export encoding, dashboard routes
    └── routes-and-actions.md      # Route map, Server Actions, validation, UI contract
```

### Source Code (repository root)

```text
supabase/
├── migrations/                    # Versioned SQL — the schema's single source of truth
│   ├── 0001_extensions_and_enums.sql
│   ├── 0002_profiles_and_auth.sql
│   ├── 0003_cities_and_addresses.sql
│   ├── 0004_catalog.sql
│   ├── 0005_product_costs.sql
│   ├── 0006_promotions_and_pricing.sql
│   ├── 0007_orders.sql
│   ├── 0008_order_functions.sql
│   ├── 0009_rls_policies.sql
│   ├── 0010_search.sql
│   ├── 0011_storage_buckets.sql
│   └── 0012_reporting.sql         # delivered_at/cancelled_at, indexes, report functions
├── seed.sql                       # Cities, categories, brands, bootstrap admin
└── tests/                         # SQL tests: pricing, placement, transitions, RLS
    ├── pricing.test.sql
    ├── place_order.test.sql
    ├── transitions.test.sql
    └── rls.test.sql

src/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx             # Sets lang + dir; loads messages
│   │   ├── page.tsx               # Home
│   │   ├── c/[...slug]/page.tsx   # Category listing
│   │   ├── p/[slug]/page.tsx      # Product detail
│   │   ├── search/page.tsx
│   │   ├── offers/page.tsx
│   │   ├── cart/page.tsx
│   │   ├── checkout/page.tsx
│   │   ├── orders/                # History + detail with status timeline
│   │   ├── account/               # Profile + addresses
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── admin/
│   │       ├── layout.tsx         # Staff gate (convenience; RLS is the boundary)
│   │       ├── orders/            # Queue + detail + transitions
│   │       ├── products/          # List + form + photos + cost
│   │       ├── categories/  brands/  promotions/  cities/  staff/
│   ├── api/cron/keepalive/route.ts
│   └── globals.css
├── components/
│   ├── ui/                        # Button, Input, Sheet, Dialog — 44px targets
│   ├── catalog/                   # ProductCard, PriceTag, CategoryNav, SearchBox
│   ├── cart/                      # CartSheet, QtyStepper, CartSummary
│   ├── orders/                    # StatusTimeline, OrderCard
│   └── admin/                     # DataTable, BilingualField, ImageUploader
├── lib/
│   ├── supabase/                  # server.ts, client.ts, service.ts (server-only)
│   ├── actions/                   # Server Actions: auth, cart, orders, admin
│   ├── validation/                # Zod schemas shared client and server
│   ├── phone.ts                   # Egyptian normalization — mirrors normalize_phone()
│   ├── money.ts                   # Piastre formatting; no arithmetic on the client
│   ├── cart-store.ts              # localStorage: {product_id, qty} only
│   └── image-resize.ts            # Browser canvas → WebP before upload
├── i18n/
│   ├── routing.ts                 # Locales ['ar','en'], default 'ar'
│   └── messages/{ar,en}.json
├── middleware.ts                  # Locale resolution + admin redirect
└── types/database.ts              # Generated from the schema

tests/
├── unit/                          # phone, money, cart-store, validation
├── integration/                   # Server Actions against local Supabase
└── e2e/                           # Playwright: Arabic journey at 360px

wrangler.jsonc                     # Workers config, Node compat, cron triggers
open-next.config.ts
next.config.ts
```

**Structure Decision**: A single Next.js application containing both the storefront and the
admin console, paired with a versioned SQL migration set that is the authoritative definition of
the schema.

Storefront and admin are one deployment rather than two because they share the entire data
layer, the same auth session, the same i18n dictionaries and the same component primitives.
Splitting them would double the deployment surface and the request budget to separate two route
groups that are already cleanly separated by role — and the security boundary between them is
RLS in the database, not the deployment topology, so a split would buy no isolation that we do
not already have.

`supabase/migrations/` is deliberately ordered so that policies (0009) land after every table
exists, and search indexing (0010) after the catalog. `lib/supabase/service.ts` is
`server-only`-guarded so the service-role key cannot be imported into a client bundle
(FR-066).

## Build Order

Six stages, each ending at a point where something real can be demonstrated. Stages 1 and 2 are
prerequisites for everything; after them, work can proceed in parallel where noted.

| Stage | Delivers | Depends on | Demo at the end of the stage |
|---|---|---|---|
| **1. Foundation** | Repo, Next.js on Workers, Supabase project, i18n + RTL shell, Tailwind, CI | — | An Arabic RTL page renders at 360px on a Cloudflare URL |
| **2. Data layer** | All 14 tables, enums, indexes, RLS policies, pricing and order functions, seed data, SQL tests | 1 | RLS matrix passes; `place_order` creates a correct order from `psql` |
| **3. Storefront (US1 + US2)** 🎯 **MVP** | Register, sign in, browse, product detail, cart, checkout, place order | 2 | A real person orders on a phone, cash on delivery |
| **4. Admin master data (US3)** | Products with photos, categories, brands, promotions, cities, staff | 2 (parallel with 3) | Staff add a product and it appears on the storefront |
| **5. Order operations (US4 + US5)** | Staff queue and transitions; customer history, tracking, self-cancel | 3, 4 | An order runs submitted → delivered with a full audit trail |
| **6. Reporting (US7)** | Dashboard, sales/customer/promotion/inventory reports, profit report, CSV and Excel export | 5 | The owner reads last month's numbers and downloads them as a spreadsheet |
| **7. Discovery + hardening (US6)** | Search, offers view, pagination, performance, scheduled jobs, backup export | 3 | Arabic and English search return the same product; jobs run |

**Why this order**: Stage 2 comes before any UI because the pricing and isolation guarantees are
database-resident — building screens first would mean building them twice. Stage 3 is the MVP
boundary: at its end the business can take real orders, with staff reading the queue directly
from the database if necessary. Stage 4 can run in parallel with Stage 3 once the schema is
fixed, since they touch disjoint routes. Stage 5 needs both.

Stage 6 (reporting) follows stage 5 because it reports on data the earlier stages produce —
there is nothing to report until orders are flowing through their full lifecycle, and
`delivered_at` only becomes meaningful once staff are marking orders delivered. Stage 7 is
deferred deliberately: category browsing is sufficient for a modest catalog, so search earns its
place only after the revenue path works.

## Decisions Confirmed by the Business Owner

Recorded 2026-08-13, so implementation proceeds without re-litigating them.

| Question | Decision | Consequence for the build |
|---|---|---|
| **Order flow** | Confirmed as specified: the customer creates the order, the ops team sees it in the queue, phones the customer to confirm, marks it confirmed in the system, and it proceeds through to delivered. | No change — this is User Story 4 and the transition table in FR-045. The `submitted` state exists precisely to hold an order until the confirmation call happens. |
| **Backups** | Launch on the **free tier** with the weekly export job; no paid tier for now. | T117 (weekly export) becomes required rather than optional, and is the only recovery point. Worst case is losing up to a week. Revisit when order history becomes something the business would hate to lose. |
| **SMS verification** | **Not needed for v1**, as originally specified. | Confirms R2: phone plus password over a synthetic internal identifier, no SMS gateway, no self-service password reset. Staff-mediated reset (FR-016) stands. |
| **Deferred features** | No preference — the v1 boundary stands as drawn. | Delivery time slots, coupon codes and cross-device cart sync stay out of scope. Each is additive later and none constrains the current schema. |
| **Project name** | **El-Gomala** (الجملة). | The synthetic auth domain becomes `@phone.elgomala.local`. Naming updated across the documents. |

## Key Design Decisions

Full reasoning in [research.md](research.md); the decisions that most shape the build:

1. **`@opennextjs/cloudflare`, not `next-on-pages`** (R1) — the latter is deprecated and
   Edge-runtime-only, which is incompatible with the Supabase server helpers.
2. **Synthetic internal email over Supabase Auth** (R2) — phone `+201001234567` maps to
   `201001234567@phone.elgomala.local`, never shown to anyone. Keeps bcrypt hashing, JWT issuance
   and `auth.uid()` in RLS, all of which hand-rolled auth would have to reimplement.
3. **Integer piastres everywhere** (R5) — a one-piastre float drift is a cash dispute at the
   door when the driver collects.
4. **`place_order()` as the only order-creation path** (R6) — no INSERT policy exists, so no
   present or future code path can create an order at a price the database did not compute.
5. **`product_costs` as a separate table** (R8) — a restricted column relies on every query
   forever remembering to omit it; a table with no grant cannot leak.
6. **`pg_trgm` over Arabic-normalized text, not `tsvector`** (R10) — Postgres has no Arabic
   stemmer, and shoppers type `مياه` and `مياة` interchangeably. Folding alef/ta-marbuta/alef-
   maqsura variants is what makes search actually find things.
7. **Cart in `localStorage` with no prices** (R11) — nothing to tamper with, zero storage cost,
   survives the language switch untouched.
8. **Browser-side image resizing** (R12) — the Workers 10 ms CPU limit rules out server-side
   processing, and the browser does it free.
9. **Report aggregation in Postgres, not the Worker** (R17) — the same 10 ms CPU ceiling. No
   rollup table in v1: at this volume a range scan is fast, and a rollup would trade an exactness
   requirement (SC-017) for a performance problem that does not exist yet.
10. **CSV exports carry a UTF-8 BOM** (R19) — without it Excel on Windows renders Arabic
    product names as mojibake, which makes the export worthless to the people who need it.
11. **Margin lives in separate admin-only report functions** (R20) — exports serialize whatever
    the query returned, so a suppressed-column approach is especially fragile in reporting.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **No backups on the Supabase free tier** | Total data loss recoverable only to the last export | Weekly export job (T117); flagged to the business owner as the point where paying $25/month buys point-in-time recovery |
| Storage ceiling: 2,000 products × 3 photos ≈ 900 MB against 1 GB | Uploads start failing | Browser resize to 1200px WebP, 4-photo cap, orphan sweep; monitor at 700 MB |
| Free-tier pausing after 7 idle days | Site down after a quiet week | 6-hourly Cloudflare Cron keep-alive (T114) |
| No password recovery channel | Locked-out customers call staff | Staff-mediated reset with audit trail (FR-016); accepted cost of the no-SMS constraint |
| Workers 10 ms CPU per invocation | Timeouts on heavy work | No image processing or heavy computation in a request; aggregation stays in Postgres |
| Arabic search quality | Shoppers cannot find products | Diacritic and orthographic-variant folding (R10); validated against real Arabic product names in seed data |
| Staff mis-priced product | Wrong price charged on delivery | Database constraints (`price > 0`), and order-line price snapshots so corrections never rewrite history |

## Success Validation

Mapping of spec success criteria to how each is verified:

| Criterion | Verification |
|---|---|
| SC-005, SC-006 (totals correct and untamperable) | `place_order` contract tests submitting crafted prices; assertions 9–11 of the RLS matrix |
| SC-007, SC-008 (customer and cost isolation) | RLS matrix assertions 1–8 under real customer, staff and admin JWTs |
| SC-010, SC-011 (audit trail and transitions) | Table-driven transition tests; history immutability assertion 14 |
| SC-016 (last-unit concurrency) | Concurrent `place_order` integration test |
| SC-003, SC-004 (performance) | Lighthouse mobile throttled to 3G; search timing over the seeded 2,000-product catalog |
| SC-012, SC-013 (RTL and language switch) | Playwright at 360px asserting no horizontal overflow in both directions; cart preserved across switch |
| SC-001, SC-002, SC-009 (task times) | Timed manual walkthroughs, including a non-technical staff member adding a product |
| SC-017, SC-019 (report accuracy and speed) | SQL tests reconciling every aggregate against the underlying orders, including Cairo-midnight boundaries and a summer-time transition; dashboard timing over a seeded month |
| SC-018, SC-020 (margin isolation and exports) | Return-type inspection of every staff-visible report function; export tests asserting the UTF-8 BOM, Arabic round-trip, formula escaping and a 5,000-row file |
| SC-014 (zero cost) | Free-tier usage review against Supabase and Cloudflare dashboards after one month |
