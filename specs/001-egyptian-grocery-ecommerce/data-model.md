# Phase 1 Data Model: Egyptian Grocery E-Commerce Platform

**Feature**: `specs/001-egyptian-grocery-ecommerce`
**Date**: 2026-08-13
**Database**: Supabase Postgres

**Conventions used throughout**

- Primary keys are `uuid` defaulting to `gen_random_uuid()`, except where a natural sequence
  is required.
- **All money is `integer` piastres** (1 EGP = 100 piastres). No `numeric`, no `float`. See
  research R5.
- Timestamps are `timestamptz`, defaulting to `now()`.
- Bilingual fields are paired `_ar` / `_en` columns, both `NOT NULL` (research R3, FR-057).
- Every table has RLS enabled. Policies are summarized per table and specified in full in
  [contracts/rls-policies.md](contracts/rls-policies.md).

---

## Enumerated types

```sql
CREATE TYPE user_role     AS ENUM ('customer', 'staff', 'admin');
CREATE TYPE unit_type     AS ENUM ('piece', 'kilo', 'carton', 'pack', 'liter');
CREATE TYPE storage_type  AS ENUM ('ambient', 'chilled', 'frozen');
CREATE TYPE discount_type AS ENUM ('percent', 'fixed');
CREATE TYPE order_status  AS ENUM (
  'submitted', 'confirmed', 'preparing',
  'out_for_delivery', 'delivered', 'cancelled', 'returned'
);
```

`unit_type` and `storage_type` values come directly from FR-052. `order_status` matches
FR-044 exactly.

---

## Entity relationship overview

```
auth.users (Supabase)
    │ 1:1
    ▼
profiles ──1:N──► addresses ──N:1──► cities
    │                                   ▲
    │ 1:N                               │ N:1
    ▼                                   │
  orders ────────────────────────────────
    │ 1:N ──► order_items ──N:1──► products
    │ 1:N ──► order_status_history ──N:1──► profiles (actor)
    │
products ──N:1──► categories (self-referencing parent)
    │    ──N:1──► brands
    │    ──1:N──► product_photos
    │    ──1:1──► product_costs        (admin-only, isolated table)
    │
promotions ──► scoped to one of: product | category | brand | entire catalog
```

---

## Identity and customers

### `profiles`

Extends `auth.users`. Created by a trigger on user signup.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users(id)` ON DELETE CASCADE | Equals `auth.uid()` |
| `full_name` | `text` | NOT NULL, length 2–120 | FR-007 |
| `phone` | `text` | NOT NULL, **UNIQUE**, CHECK `^\+201[0-25][0-9]{8}$` | Canonical E.164 (research R2) |
| `role` | `user_role` | NOT NULL, DEFAULT `'customer'` | FR-060, research R16 |
| `preferred_locale` | `text` | NOT NULL, DEFAULT `'ar'`, CHECK IN `('ar','en')` | FR-004 |
| `is_active` | `boolean` | NOT NULL, DEFAULT `true` | Deactivated staff keep history (FR-061) |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**Validation rules**

- The phone CHECK enforces Egyptian mobile prefixes: `+2010`, `+2011`, `+2012`, `+2015`.
  Normalization to this form happens before insert (FR-009, FR-010).
- `phone` UNIQUE delivers FR-011 at the database level, not merely in the form.
- **`role` is not self-assignable.** The RLS update policy for a customer's own row excludes
  `role` and `is_active`; a trigger raises if a non-admin attempts to change either. Without
  this, any customer could promote themselves to admin.

**RLS**: customer reads and updates own row (minus `role`, `is_active`); staff read all;
admin full.

**Indexes**: `UNIQUE(phone)`; partial index on `role` where `role <> 'customer'`.

---

### `cities`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `name_ar` / `name_en` | `text` | NOT NULL | FR-005 |
| `delivery_fee` | `integer` | NOT NULL, CHECK `>= 0` | Piastres. FR-030, FR-056 |
| `min_order_value` | `integer` | NOT NULL, CHECK `>= 0` | Piastres. FR-031 |
| `is_active` | `boolean` | NOT NULL, DEFAULT `true` | FR-056 |
| `sort_order` | `integer` | NOT NULL, DEFAULT 0 | |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**RLS**: anyone reads where `is_active`; staff read all; admin full write.

---

### `addresses`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `profile_id` | `uuid` | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE | |
| `city_id` | `uuid` | NOT NULL, FK → `cities(id)` ON DELETE RESTRICT | |
| `street_address` | `text` | NOT NULL, length 5–300 | FR-007 |
| `landmark` | `text` | **NOT NULL**, length 3–200 | FR-007 — drivers cannot find addresses without it |
| `building` | `text` | NULL, length ≤ 60 | Optional detail |
| `floor_apartment` | `text` | NULL, length ≤ 60 | Optional detail |
| `is_default` | `boolean` | NOT NULL, DEFAULT `false` | FR-015 |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**Validation rules**

- `landmark` is `NOT NULL` with a minimum length — the single most operationally important
  field in the schema, per the business's own statement that drivers cannot deliver without
  it (Story 2, scenario 5).
- At most one default per customer, enforced by a partial unique index:
  `UNIQUE (profile_id) WHERE is_default`.
- `ON DELETE RESTRICT` on `city_id` prevents removing a city still referenced (FR-061).

**RLS**: customer full access to own rows only; staff read all (needed to read delivery
details on an order); no customer may see another's (FR-062).

**Indexes**: `(profile_id)`; partial unique `(profile_id) WHERE is_default`.

---

## Catalog

### `categories`

Self-referencing hierarchy, at least two levels (FR-018).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `parent_id` | `uuid` | NULL, FK → `categories(id)` ON DELETE RESTRICT | NULL = top level |
| `name_ar` / `name_en` | `text` | NOT NULL | FR-005 |
| `slug` | `text` | NOT NULL, UNIQUE | URL segment, Latin |
| `image_path` | `text` | NULL | Storage object path |
| `sort_order` | `integer` | NOT NULL, DEFAULT 0 | FR-053 |
| `is_active` | `boolean` | NOT NULL, DEFAULT `true` | FR-053 |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**Validation rules**: a category may not be its own ancestor — enforced by a trigger walking
`parent_id` on insert and update. Depth is capped at 3 levels to keep breadcrumb rendering and
promotion-ancestor resolution bounded.

**RLS**: anyone reads where `is_active`; admin full write.

---

### `brands`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `name_ar` / `name_en` | `text` | NOT NULL | FR-005 |
| `slug` | `text` | NOT NULL, UNIQUE | |
| `logo_path` | `text` | NULL | |
| `is_active` | `boolean` | NOT NULL, DEFAULT `true` | |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**RLS**: anyone reads where `is_active`; admin full write.

---

### `products`

Every attribute the business listed in FR-051.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `category_id` | `uuid` | NOT NULL, FK → `categories(id)` ON DELETE RESTRICT | |
| `brand_id` | `uuid` | NULL, FK → `brands(id)` ON DELETE RESTRICT | Unbranded produce exists |
| `name_ar` / `name_en` | `text` | NOT NULL, length 2–200 | FR-005, FR-057 |
| `description_ar` / `description_en` | `text` | NULL | Optional; falls back across languages when one is absent |
| `slug` | `text` | NOT NULL, UNIQUE | |
| `price` | `integer` | NOT NULL, CHECK `> 0` | **Piastres.** Selling price |
| `unit` | `unit_type` | NOT NULL | FR-052 |
| `pack_size` | `text` | NULL, length ≤ 40 | e.g. "1 لتر", "500g" |
| `units_per_carton` | `integer` | NULL, CHECK `> 0` | |
| `weight_grams` | `integer` | NULL, CHECK `> 0` | |
| `barcode` | `text` | NULL, UNIQUE | EAN/UPC |
| `sku` | `text` | NOT NULL, UNIQUE | |
| `stock_qty` | `integer` | NOT NULL, DEFAULT 0, CHECK `>= 0` | FR-033, FR-043 |
| `min_order_qty` | `integer` | NOT NULL, DEFAULT 1, CHECK `> 0` | FR-032 |
| `storage` | `storage_type` | NOT NULL, DEFAULT `'ambient'` | FR-052 |
| `is_active` | `boolean` | NOT NULL, DEFAULT `true` | |
| `search_text` | `text` | GENERATED ALWAYS AS `search_normalize(...)` STORED | Research R10 |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**Validation rules**

- `CHECK (stock_qty >= 0)` is the last line of defence behind the `place_order` transaction —
  a concurrent decrement that would go negative aborts the transaction rather than overselling
  (SC-016).
- `price > 0` — a zero-price product is a data-entry error, not a giveaway.
- `barcode` is UNIQUE but nullable; loose produce has no barcode.
- `ON DELETE RESTRICT` on both foreign keys satisfies FR-061 for categories and brands.

**RLS**: anyone reads where `is_active`; staff read all; admin full write.

**Indexes**

- `(category_id) WHERE is_active` — the category listing query.
- `(brand_id) WHERE is_active`.
- GIN `(search_text gin_trgm_ops)` — FR-019, SC-004.
- `UNIQUE(sku)`, `UNIQUE(barcode)`, `UNIQUE(slug)`.

---

### `product_costs`

**Deliberately a separate table.** See research R8: a cost column on `products` would depend
on every query remembering to omit it. A separate table with no grant for the `authenticated`
role makes the guarantee structural (FR-063, SC-008).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `product_id` | `uuid` | PK, FK → `products(id)` ON DELETE CASCADE | |
| `cost_price` | `integer` | NOT NULL, CHECK `>= 0` | Piastres. FR-059 |
| `supplier_name` | `text` | NULL | |
| `updated_by` | `uuid` | NULL, FK → `profiles(id)` | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**RLS**: **admin only, for every operation.** No policy exists for `customer` or `staff`, and
the table is excluded from the `anon` and `authenticated` grants entirely.

---

### `product_photos`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `product_id` | `uuid` | NOT NULL, FK → `products(id)` ON DELETE CASCADE | |
| `storage_path` | `text` | NOT NULL | Object path in `product-images` |
| `thumb_path` | `text` | NULL | 400px variant (research R12) |
| `alt_ar` / `alt_en` | `text` | NULL | Accessibility |
| `sort_order` | `integer` | NOT NULL, DEFAULT 0 | FR-054 |
| `is_primary` | `boolean` | NOT NULL, DEFAULT `false` | FR-054 |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**Validation rules**: at most one primary per product — partial unique index
`UNIQUE (product_id) WHERE is_primary`. A cap of 4 photos per product is enforced by trigger,
protecting the storage budget identified in research R12.

**RLS**: anyone reads where the parent product is active; admin full write.

---

### `promotions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `name_ar` / `name_en` | `text` | NOT NULL | Shown as the discount label |
| `discount_type` | `discount_type` | NOT NULL | `percent` or `fixed` |
| `discount_value` | `integer` | NOT NULL, CHECK `> 0` | Percent: 1–100. Fixed: piastres |
| `starts_at` | `timestamptz` | NOT NULL | FR-055 |
| `ends_at` | `timestamptz` | NOT NULL, CHECK `> starts_at` | FR-055 |
| `product_id` | `uuid` | NULL, FK → `products(id)` ON DELETE CASCADE | Scope option |
| `category_id` | `uuid` | NULL, FK → `categories(id)` ON DELETE CASCADE | Scope option |
| `brand_id` | `uuid` | NULL, FK → `brands(id)` ON DELETE CASCADE | Scope option |
| `is_active` | `boolean` | NOT NULL, DEFAULT `true` | |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**Validation rules**

- Exactly one scope, or none (catalog-wide), enforced by a check constraint:
  ```sql
  CHECK (num_nonnulls(product_id, category_id, brand_id) <= 1)
  ```
- Percentage bounds: `CHECK (discount_type <> 'percent' OR discount_value BETWEEN 1 AND 100)`.
- Category scope resolves through ancestors, so a promotion on "Dairy" reaches "Dairy ›
  Yoghurt" (research R7).
- Expiry needs no job — `ends_at` simply stops matching (Story 3, scenario 4).

**RLS**: anyone reads where `is_active AND now() BETWEEN starts_at AND ends_at`; staff read
all; admin full write.

**Indexes**: `(starts_at, ends_at) WHERE is_active`; one each on the three scope columns.

---

## Derived pricing

### `effective_price(p_product_id uuid, p_at timestamptz)` — function

Returns `(base_price, effective_price, discount_amount, promotion_id)`.

Resolution, per research R7:

1. Gather promotions matching the product directly, by brand, by its category **or any
   ancestor**, or catalog-wide.
2. Keep those with `is_active` and `p_at BETWEEN starts_at AND ends_at` (FR-028).
3. Compute each candidate's resulting price:
   - `percent` → `price - floor(price * discount_value / 100)` — rounding favours the customer
   - `fixed` → `price - discount_value`
4. Take the **lowest** result — most favourable to the customer, never compounded (FR-027).
5. Clamp at `GREATEST(result, 0)` (FR-029).

### `product_pricing` — view

`product_id, base_price, effective_price, discount_amount, promotion_id`, evaluated at
`now()`. Listings join this so prices arrive in the same round trip as the products.

---

## Orders

### `orders`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `reference` | `text` | NOT NULL, UNIQUE | `EG-YYMMDD-NNNN` (research R14, FR-039) |
| `profile_id` | `uuid` | NOT NULL, FK → `profiles(id)` ON DELETE RESTRICT | |
| `city_id` | `uuid` | NOT NULL, FK → `cities(id)` ON DELETE RESTRICT | |
| `status` | `order_status` | NOT NULL, DEFAULT `'submitted'` | FR-041 |
| `subtotal` | `integer` | NOT NULL, CHECK `>= 0` | Piastres, server-computed |
| `discount_total` | `integer` | NOT NULL, DEFAULT 0, CHECK `>= 0` | Piastres |
| `delivery_fee` | `integer` | NOT NULL, CHECK `>= 0` | Piastres, snapshot of city fee |
| `grand_total` | `integer` | NOT NULL, CHECK `>= 0` | Piastres |
| `recipient_name` | `text` | NOT NULL | Address snapshot (FR-040) |
| `recipient_phone` | `text` | NOT NULL | Address snapshot |
| `street_address` | `text` | NOT NULL | Address snapshot |
| `landmark` | `text` | NOT NULL | Address snapshot — the driver's instruction |
| `building` / `floor_apartment` | `text` | NULL | Address snapshot |
| `city_name_ar` / `city_name_en` | `text` | NOT NULL | Address snapshot |
| `customer_note` | `text` | NULL, length ≤ 500 | |
| `idempotency_key` | `text` | NOT NULL, **UNIQUE** | FR-038 (research R6) |
| `placed_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**Why the address is snapshotted rather than referenced**: a customer editing or deleting an
address after ordering must not change where a driver was told to go. FR-040 requires the
address *as it stood at placement*, so the order carries its own copy. The same reasoning
applies to the city name and the delivery fee.

**Consistency constraint**:
```sql
CHECK (grand_total = subtotal - discount_total + delivery_fee)
```
This is a structural guarantee that the recorded total is internally coherent, backing SC-005.

**RLS**

- Customer: `SELECT` where `profile_id = auth.uid()` (FR-062). **No direct `INSERT`** — the
  only insert path is `place_order` (FR-025, FR-037). `UPDATE` restricted to own order,
  status `submitted` → `cancelled`, and in practice routed through `set_order_status`.
- Staff and admin: read all; status changes only via `set_order_status`.

**Indexes**: `UNIQUE(reference)`, `UNIQUE(idempotency_key)`, `(profile_id, placed_at DESC)`,
`(status, placed_at DESC)` for the staff queue (FR-058), `(city_id)`.

---

### `order_items`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `order_id` | `uuid` | NOT NULL, FK → `orders(id)` ON DELETE CASCADE | |
| `product_id` | `uuid` | NOT NULL, FK → `products(id)` ON DELETE RESTRICT | FR-061 |
| `product_name_ar` / `product_name_en` | `text` | NOT NULL | Snapshot (FR-034) |
| `unit` | `unit_type` | NOT NULL | Snapshot |
| `pack_size` | `text` | NULL | Snapshot |
| `qty` | `integer` | NOT NULL, CHECK `> 0` | |
| `unit_price` | `integer` | NOT NULL, CHECK `>= 0` | Piastres, as charged |
| `unit_discount` | `integer` | NOT NULL, DEFAULT 0, CHECK `>= 0` | Piastres, per unit |
| `line_total` | `integer` | NOT NULL, CHECK `>= 0` | Piastres |
| `promotion_id` | `uuid` | NULL, FK → `promotions(id)` ON DELETE SET NULL | Which promotion applied |

**Consistency constraint**:
```sql
CHECK (line_total = (unit_price - unit_discount) * qty)
```

**Why names are snapshotted**: FR-034 requires historical orders to remain readable and
correctly priced after the product changes. A renamed or reprinted product must not rewrite
what a customer was told they bought.

**RLS**: customer reads where the parent order is theirs; staff and admin read all. No insert,
update or delete for anyone — items exist only as written by `place_order`.

**Indexes**: `(order_id)`, `(product_id)`.

---

### `order_status_history`

Append-only. FR-046, FR-047.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `order_id` | `uuid` | NOT NULL, FK → `orders(id)` ON DELETE CASCADE | |
| `from_status` | `order_status` | NULL | NULL for the initial `submitted` entry |
| `to_status` | `order_status` | NOT NULL | |
| `actor_id` | `uuid` | NULL, FK → `profiles(id)` ON DELETE SET NULL | Who acted |
| `actor_role` | `user_role` | NOT NULL | Snapshot — survives a later role change |
| `note` | `text` | NULL, length ≤ 500 | FR-049 |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**Immutability**: **no `UPDATE` or `DELETE` policy exists for any role**, including admin.
Inserts occur only inside `set_order_status`. There is no route through which a history row can
be altered, which is what FR-047 demands and what SC-010 measures.

`actor_id` is `ON DELETE SET NULL` while `actor_role` is a snapshot column: if a staff account
is later removed, the history still records that a staff member — not a customer — made the
change.

**RLS**: customer reads where the parent order is theirs; staff and admin read all; no writes
from any role.

**Indexes**: `(order_id, created_at)`.

---

## Supporting tables

### `login_attempts`

Supports FR-014 (research R2).

| Column | Type | Constraints |
|---|---|---|
| `id` | `bigserial` | PK |
| `phone` | `text` | NOT NULL — canonical form |
| `succeeded` | `boolean` | NOT NULL |
| `attempted_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

Sign-in refuses when failures for one phone exceed the threshold inside the window. Rows older
than 24 hours are swept by the scheduled job, keeping the table bounded against the 500 MB
ceiling.

**RLS**: no access for any client role; written and read only by `SECURITY DEFINER` functions.

### `admin_audit_log`

Records staff-mediated password resets (FR-016) and other privileged administrative actions.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `actor_id` | `uuid` | NOT NULL, FK → `profiles(id)` |
| `action` | `text` | NOT NULL |
| `target_type` / `target_id` | `text` / `uuid` | NULL |
| `detail` | `jsonb` | NULL |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

**RLS**: admin reads; inserts only from `SECURITY DEFINER` functions; no updates or deletes.

---

## State transitions

The permitted `order_status` transitions (FR-045), enforced inside `set_order_status`:

```
                    ┌──────────────┐
                    │  submitted   │ ◄── place_order (initial)
                    └──────┬───────┘
              cancel ◄─────┼─────► confirmed
                           │            │
                           │            ▼
              cancel ◄─────┼───────  preparing
                           │            │
                           │            ▼
              cancel ◄─────┴──── out_for_delivery
                                        │
                                        ▼
                                    delivered
                                        │
                                        ▼
                                    returned  (terminal)

  cancelled (terminal)
```

| From | Permitted to | Who |
|---|---|---|
| `submitted` | `confirmed` | staff, admin |
| `submitted` | `cancelled` | **customer (own order)**, staff, admin |
| `confirmed` | `preparing`, `cancelled` | staff, admin |
| `preparing` | `out_for_delivery`, `cancelled` | staff, admin |
| `out_for_delivery` | `delivered` | staff, admin |
| `delivered` | `returned` | staff, admin |
| `cancelled` | — terminal | — |
| `returned` | — terminal | — |

Every other pair is refused (Story 4, scenarios 3 and 4). Customer self-cancellation is legal
only from `submitted` (FR-048) — after staff confirm, the basket may already be picked.

**Race resolution** (FR-050): the function locks the order row with `SELECT ... FOR UPDATE` and
re-reads `status` inside the lock. A simultaneous customer cancel and staff confirm serialize;
the loser finds a status its transition is not legal from and is refused with "this order has
already moved on".

---

## Row Level Security summary

| Table | anon | customer | staff | admin |
|---|---|---|---|---|
| `profiles` | — | own (read/update, not `role`) | read all | full |
| `addresses` | — | own (full) | read all | read all |
| `cities` | read active | read active | read all | full |
| `categories` | read active | read active | read all | full |
| `brands` | read active | read active | read all | full |
| `products` | read active | read active | read all | full |
| `product_photos` | read (active parent) | read (active parent) | read all | full |
| `promotions` | read active + in window | read active + in window | read all | full |
| **`product_costs`** | **none** | **none** | **none** | **full** |
| `orders` | — | own (read; cancel own `submitted`) | read all | read all |
| `order_items` | — | read (own order) | read all | read all |
| `order_status_history` | — | read (own order); never write | read all; never write | read all; never write |
| `login_attempts` | — | none | none | none |
| `admin_audit_log` | — | none | none | read |

Full policy SQL: [contracts/rls-policies.md](contracts/rls-policies.md).

---

## Storage

**Bucket `product-images`** — public read, admin write.

```
product-images/
  products/{product_id}/{photo_id}.webp        # 1200px longest edge
  products/{product_id}/{photo_id}_thumb.webp  # 400px
  categories/{category_id}.webp
  brands/{brand_id}.webp
```

Storage policies: `SELECT` for `public`; `INSERT`, `UPDATE`, `DELETE` restricted to `admin`.
Images are resized and re-encoded to WebP **in the browser before upload** (research R12,
FR-068) — the Workers free tier's 10 ms CPU limit rules out server-side image processing, and
the browser does the work at no cost.

---

## Seed data

Required before the storefront is usable:

1. **Cities** — Cairo, Giza, Alexandria with their fees and minimum order values (FR-056).
2. **Categories** — a starter grocery tree, both languages: خضروات وفواكه / Fruits &
   Vegetables, ألبان وأجبان / Dairy & Cheese, مشروبات / Beverages, بقالة / Pantry,
   مجمدات / Frozen, منظفات / Cleaning, عناية شخصية / Personal Care.
3. **Brands** — a starter set of Egyptian FMCG brands, both languages.
4. **Admin account** — one bootstrap `admin` profile, created by migration, so the first staff
   member can sign in and create the rest (FR-060, and the reason staff accounts are not
   self-registered).
