# Quickstart & Validation Guide

**Feature**: `specs/001-egyptian-grocery-ecommerce`

How to bring the project up locally, deploy it, and verify that the guarantees the constitution
insists on actually hold. Written to be runnable by someone joining the project cold.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 22 LTS | Build and runtime toolchain |
| npm | 10+ | Package management |
| Docker | current | Runs the local Supabase stack |
| Supabase CLI | 2.x | Local database, migrations, type generation |
| Wrangler | 4.x | Cloudflare Workers deploy and local preview |

Accounts needed: a Supabase project (free tier) and a Cloudflare account (free tier). Neither
requires a payment method for this stack.

---

## Local setup

```bash
npm install
supabase start                 # Postgres, Auth, Storage on localhost
supabase db reset              # Applies migrations/ then seed.sql
npm run gen:types              # Regenerates src/types/database.ts from the schema
cp .env.example .env.local     # Fill from the `supabase start` output
npm run dev                    # http://localhost:3000 → redirects to /ar
```

`supabase db reset` is the canonical way to rebuild: it applies every migration from empty and
then seeds. If a schema change works only against an already-populated database, the migration
is wrong.

### Environment variables

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Anon key — safe to expose; RLS is the boundary |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Bypasses RLS. Never import into a client component |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical origin |
| `CRON_SECRET` | Server only | Shared secret for the scheduled endpoints |

`SUPABASE_SERVICE_ROLE_KEY` is used only in `src/lib/supabase/service.ts`, which carries the
`server-only` import guard. If that key ever reaches a client bundle, every RLS policy in the
system is void (FR-066). The build fails rather than shipping it.

### One-time Supabase dashboard configuration

Two settings are not expressible in migrations and must be set on the hosted project:

1. **Authentication → Providers → Email**: enabled, with **"Confirm email" turned off**.
   Without this, signup stalls waiting for a confirmation that can never arrive — there is no
   mailbox behind the synthetic address (research R2).
2. **Authentication → Providers → Phone**: disabled. It would require a paid SMS gateway.

---

## Verifying the critical guarantees

These are the four areas the constitution names as money-or-data critical. Run them before
believing the system works.

### 1. Server-authoritative pricing (Principle I, SC-005, SC-006)

```bash
npm run test:sql -- pricing.test.sql
npm run test:sql -- place_order.test.sql
```

**Expected**: every case in the tables at [contracts/rpc-contracts.md](contracts/rpc-contracts.md)
passes. The decisive ones:

- Submitting `{"product_id": "...", "qty": 1, "unit_price": 1}` produces an order at the
  **database's** price, not `1`.
- Submitting `grand_total: 0` produces the computed total.
- A price changed between `price_cart` and `place_order` results in an order at the placement
  price.

Manual confirmation that the client cannot write a price at all:

```sql
-- As an authenticated customer JWT (not the service role):
INSERT INTO orders (profile_id, city_id, subtotal, grand_total, ...) VALUES (...);
-- Expected: new row violates row-level security policy for table "orders"
-- There is no INSERT policy for any role. This is the guarantee, not a check.
```

### 2. Customer and cost isolation (Principle II, SC-007, SC-008)

```bash
npm run test:sql -- rls.test.sql
```

**Expected**: all 20 assertions in
[contracts/rls-policies.md](contracts/rls-policies.md#verification-matrix) pass. Spot-check the
two that matter most, using two real customer JWTs:

```sql
-- As Customer A, asking for Customer B's orders:
SELECT * FROM orders WHERE profile_id = '<customer-B-uuid>';
-- Expected: 0 rows. Not an error — simply nothing, because the policy filters it away.

-- As a customer, and again as staff:
SELECT * FROM product_costs;
-- Expected: permission denied for table product_costs
-- Not an empty result — no grant exists at all.
```

The distinction matters: 0 rows means the policy worked; `permission denied` means the table is
not reachable by that role under any query. Cost data gets the stronger treatment.

### 3. Order lifecycle integrity (Principle VII, SC-010, SC-011)

```bash
npm run test:sql -- transitions.test.sql
```

**Expected**: every legal transition succeeds, every illegal one raises `invalid_transition`,
and each accepted transition appends exactly one history row. Confirm immutability directly:

```sql
UPDATE order_status_history SET to_status = 'delivered' WHERE id = '<any>';
-- Expected: denied for every role including admin. No UPDATE policy exists.
```

### 4. Concurrency (SC-016)

```bash
npm run test:integration -- concurrent-order
```

Two simultaneous `place_order` calls for the last unit of stock. **Expected**: exactly one
order exists; the other call raises `insufficient_stock`; `stock_qty` is `0`, never negative.

---

## End-to-end journey (SC-001, SC-012, SC-013)

```bash
npm run test:e2e
```

Playwright drives the primary journey at a 360px viewport in Arabic:

1. Land on `/` → redirected to `/ar`, `<html dir="rtl">`.
2. Browse a category, open a product, confirm both languages and the promotional price.
3. Add to cart; confirm the total comes from the server.
4. Register with name, phone, city, address and **landmark** — confirm the form refuses a blank
   landmark.
5. Check out; confirm the delivery fee matches the selected city.
6. Place the order; confirm the reference, the totals and "cash on delivery".
7. Open order history; confirm the order appears with status *submitted*.
8. Cancel it; confirm it moves to *cancelled* and the history records the customer as actor.

Two assertions run on every page: **no horizontal overflow at 360px** (SC-012), and **switching
language mid-flow preserves the cart and the current page** (SC-013).

### Manual checks worth doing by hand

- Switch to English mid-checkout: layout flips to LTR, cart intact, same step.
- Register the same number as `01001234567` and `+20 100 123 4567`: the second is refused as
  already registered (FR-009, FR-011).
- Sign in with a wrong password five times: further attempts are refused (FR-014).
- As a signed-in customer, navigate directly to `/ar/admin`: denied, with no admin data in the
  response body (FR-064).

---

## Deployment

```bash
supabase link --project-ref <ref>
supabase db push               # Applies migrations to the hosted project

npm run build                  # next build + opennextjs-cloudflare build
npx wrangler deploy
```

Secrets go to Cloudflare, not into the repository:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CRON_SECRET
```

### Scheduled jobs (`wrangler.jsonc`)

| Schedule | Job | Why |
|---|---|---|
| `0 */6 * * *` | Keep-alive | Free-tier projects pause after 7 days without an API request |
| `0 3 * * *` | Login-attempt sweep | Bounds the table against the 500 MB ceiling |
| `0 4 * * 0` | Orphan image sweep | Reclaims storage objects no photo row references |
| `0 5 * * 0` | Data export | **The free tier has no backups** — this is the only recovery point |

### Post-deploy checklist

- [ ] Email confirmations **off**; phone provider **disabled**
- [ ] `product-images` bucket exists, public read, admin write
- [ ] Bootstrap admin account can sign in at `/ar/admin`
- [ ] Cities seeded with fees and minimum order values
- [ ] Cron triggers registered and firing
- [ ] `SUPABASE_SERVICE_ROLE_KEY` absent from the client bundle — verify:
      `npm run build && grep -r "service_role" .open-next/ || echo "clean"`

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Signup hangs, no session | Email confirmation left on | Turn it off in Auth settings — nothing can confirm a synthetic address |
| Queries return 0 rows unexpectedly | RLS filtering the anon role | Confirm `is_active`; check the JWT is actually attached |
| `permission denied for table product_costs` | Working as intended | Only `admin` may read it |
| Layout looks wrong in Arabic | Physical `left`/`right` used | Replace with logical `start`/`end` utilities; the lint rule catches these |
| Prices show as `4500` | Formatting skipped | Piastres — divide by 100 at the render boundary only |
| Site unreachable after a quiet week | Free-tier project paused | Resume in the dashboard; confirm the keep-alive cron is firing |
| Deploy fails on Node APIs | `nodejs_compat` missing | Add the compatibility flag in `wrangler.jsonc` |
| Search misses an Arabic product | Term not normalized | Both sides must pass through `search_normalize()` |
