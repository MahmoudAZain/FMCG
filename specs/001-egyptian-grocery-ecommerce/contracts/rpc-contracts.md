# Contract: Database Functions (RPC)

**Feature**: `specs/001-egyptian-grocery-ecommerce`

These functions are the **only** write path for orders and the only source of prices. Server
Actions call them; the client never calls a pricing or ordering function with price data.
All money is integer piastres.

---

## `search_normalize(p_text text) → text`

`IMMUTABLE`. Used in the `products.search_text` generated column and to normalize incoming
search terms so both sides of the comparison are folded identically.

Transformations, in order: lowercase → strip Arabic diacritics (`U+064B`–`U+0652`) → strip
tatweel (`U+0640`) → fold `أ إ آ ٱ → ا`, `ة → ه`, `ى → ي`, `ؤ → و`, `ئ → ي` → collapse
whitespace.

**Why**: Egyptian shoppers type `مياه` and `مياة` interchangeably, and diacritics appear
inconsistently. Without folding, a correct product is simply not found (FR-019, research R10).

---

## `normalize_phone(p_input text) → text`

`IMMUTABLE`. Reduces any accepted Egyptian mobile notation to canonical E.164 (FR-009).

| Input | Output |
|---|---|
| `01001234567` | `+201001234567` |
| `+20 100 123 4567` | `+201001234567` |
| `0020-100-123-4567` | `+201001234567` |
| `201001234567` | `+201001234567` |
| `0221234567` (landline) | raises `invalid_phone` |
| `0199123456` (bad prefix/length) | raises `invalid_phone` |

**Errors**: `invalid_phone` when the result does not match `^\+201[0-25][0-9]{8}$` (FR-010).

---

## `effective_price(p_product_id uuid, p_at timestamptz DEFAULT now())`

`STABLE`. Returns one row:

```
base_price       integer  -- products.price, piastres
effective_price  integer  -- after the single best discount, clamped at 0
discount_amount  integer  -- base_price - effective_price
promotion_id     uuid     -- NULL when no promotion applies
```

**Behaviour** (FR-027, FR-028, FR-029):

1. Candidates = promotions scoped to this product, its brand, its category **or any ancestor**,
   or catalog-wide.
2. Filter to `is_active AND p_at BETWEEN starts_at AND ends_at`.
3. `percent` → `base_price - floor(base_price * discount_value / 100)`; `fixed` →
   `base_price - discount_value`.
4. Return the **lowest** resulting price. Discounts never compound.
5. Clamp at 0.

**Contract tests**

| Case | Expectation |
|---|---|
| No promotion | `effective_price = base_price`, `promotion_id IS NULL` |
| Promotion starting tomorrow | No discount applied |
| Promotion ended yesterday | No discount applied |
| 20% on 1000 piastres | `effective_price = 800` |
| 33% on 1000 piastres | `effective_price = 670` — discount floors to 330, favouring the customer |
| Fixed 200 on 1000 | `effective_price = 800` |
| Two overlapping (10% and 30%) | 30% wins; result is not 63% off |
| Fixed 5000 on 1000 | `effective_price = 0`, never negative |
| Promotion on ancestor category | Applies to the descendant product |
| `is_active = false` | Ignored regardless of dates |

---

## `price_cart(p_items jsonb, p_city_id uuid) → jsonb`

`STABLE`. The preview used by the cart and checkout screens. **Shares its pricing path with
`place_order`**, which is what makes the displayed total and the recorded total incapable of
diverging (SC-005).

**Input** — identifiers and quantities only. Any price-like field is ignored (FR-026):

```json
{
  "items": [
    { "product_id": "uuid", "qty": 3 },
    { "product_id": "uuid", "qty": 1 }
  ]
}
```

**Output**:

```json
{
  "lines": [{
    "product_id": "uuid",
    "name_ar": "لبن جهينة كامل الدسم 1 لتر",
    "name_en": "Juhayna Full Cream Milk 1L",
    "unit": "piece",
    "pack_size": "1 L",
    "qty": 3,
    "unit_price": 4500,
    "unit_discount": 500,
    "line_total": 12000,
    "promotion_id": "uuid",
    "available": true,
    "issues": []
  }],
  "subtotal": 12000,
  "discount_total": 1500,
  "delivery_fee": 2500,
  "grand_total": 14500,
  "min_order_value": 10000,
  "meets_minimum": true,
  "shortfall": 0,
  "blocking_issues": []
}
```

**Issue codes** on a line: `out_of_stock`, `insufficient_stock` (with `available_qty`),
`below_min_qty` (with `min_order_qty`), `inactive_product`.
**Blocking issues** at cart level: `below_min_order_value` (with `shortfall`),
`city_inactive`, `empty_cart`.

Preview **never mutates** and never reserves stock. It reports issues so the shopper sees them
before committing (FR-035), while `place_order` re-validates independently — the preview is
advisory, the placement is authoritative.

---

## `place_order(p_items jsonb, p_address_id uuid, p_idempotency_key text, p_note text DEFAULT NULL) → jsonb`

`SECURITY DEFINER`, `VOLATILE`. **The sole path by which an order comes into existence.**

**Input** — again identifiers and quantities only. No prices, no totals, no fees. Any such
field present in the payload is discarded rather than validated (FR-026).

**Transaction sequence** (all-or-nothing, FR-037):

1. `v_uid := auth.uid()`; raise `not_authenticated` if NULL (FR-036).
2. Return the existing order if `p_idempotency_key` is already present — a double submission
   creates exactly one order (FR-038).
3. Load the address; raise `address_not_found` unless `profile_id = v_uid` (FR-062).
4. Load the city; raise `city_inactive` unless active.
5. Raise `empty_cart` if no items.
6. `SELECT ... FOR UPDATE` on every referenced product, **ordered by `product_id`** — a fixed
   lock order prevents deadlock between concurrent orders touching the same products.
7. Per line, re-read current `price`, `stock_qty`, `min_order_qty`, `is_active`; resolve
   `effective_price(product_id, now())`. Raise `product_unavailable`, `insufficient_stock` (with
   available quantity) or `below_min_qty` (with the minimum), naming the product (FR-032,
   FR-033).
8. Compute `subtotal`, `discount_total`; read the city's `delivery_fee`; compute
   `grand_total = subtotal - discount_total + delivery_fee`.
9. Raise `below_min_order_value` with the shortfall if the subtotal is under the city minimum
   (FR-031).
10. Generate `reference` as `EG-YYMMDD-NNNN` (FR-039).
11. Insert `orders` with the address snapshot including landmark (FR-040), status `submitted`
    (FR-041).
12. Insert `order_items` with the price snapshot and the product name/unit snapshot (FR-034).
13. `UPDATE products SET stock_qty = stock_qty - qty` for each line (FR-043). The
    `CHECK (stock_qty >= 0)` constraint aborts the whole transaction if a concurrent order won
    the race, so exactly one succeeds (SC-016).
14. Insert the initial `order_status_history` row: `from_status NULL → submitted`, actor the
    customer (FR-046).

**Output**:

```json
{
  "order_id": "uuid",
  "reference": "EG-260813-0042",
  "subtotal": 12000,
  "discount_total": 1500,
  "delivery_fee": 2500,
  "grand_total": 14500,
  "status": "submitted",
  "placed_at": "2026-08-13T12:04:11Z"
}
```

**Errors** (all abort the transaction, leaving no partial order):

| Code | Meaning |
|---|---|
| `not_authenticated` | No signed-in customer (FR-036) |
| `empty_cart` | No items submitted |
| `address_not_found` | Address absent or not the caller's (FR-062) |
| `city_inactive` | Destination city no longer served |
| `product_unavailable` | Product inactive or deleted |
| `insufficient_stock` | Requested exceeds available; includes `available_qty` |
| `below_min_qty` | Below the product's minimum; includes `min_order_qty` |
| `below_min_order_value` | Subtotal under the city minimum; includes `shortfall` |

**Contract tests**

| Case | Expectation |
|---|---|
| Client submits `unit_price: 1` | Ignored; order records the database price (FR-026, SC-006) |
| Client submits `grand_total: 0` | Ignored; total computed server-side |
| Same idempotency key twice | One order; second call returns the first (FR-038) |
| Two concurrent orders for the last unit | Exactly one succeeds; the other raises `insufficient_stock` (SC-016) |
| Price changed after `price_cart` | Order records the price at placement, not at preview (FR-034) |
| Promotion expired between preview and placement | Undiscounted price recorded |
| Another customer's `address_id` | `address_not_found` — never "forbidden", which would confirm existence |
| Failure at any step | No order, no items, no history, no stock change (FR-037) |

---

## `set_order_status(p_order_id uuid, p_new_status order_status, p_note text DEFAULT NULL) → jsonb`

`SECURITY DEFINER`, `VOLATILE`. The only path that changes an order's status.

**Sequence**:

1. `SELECT ... FOR UPDATE` on the order; re-read `status` **inside the lock** (FR-050).
2. Resolve the caller's role from `profiles`.
3. Authorize:
   - `staff` / `admin` — any transition legal in the table below.
   - `customer` — only `submitted → cancelled`, and only on an order where
     `profile_id = auth.uid()` (FR-048).
4. Reject an illegal transition with `invalid_transition` (FR-045).
5. Update the status and append the history row with `from_status`, `to_status`, `actor_id`,
   `actor_role`, `note`, `created_at` (FR-046, FR-049).

**Transition table** (FR-045):

| From | To | Allowed roles |
|---|---|---|
| `submitted` | `confirmed` | staff, admin |
| `submitted` | `cancelled` | customer (own), staff, admin |
| `confirmed` | `preparing` | staff, admin |
| `confirmed` | `cancelled` | staff, admin |
| `preparing` | `out_for_delivery` | staff, admin |
| `preparing` | `cancelled` | staff, admin |
| `out_for_delivery` | `delivered` | staff, admin |
| `delivered` | `returned` | staff, admin |
| `cancelled` | — | terminal |
| `returned` | — | terminal |

**Errors**: `order_not_found`, `not_authorized`, `invalid_transition` (includes `from` and
`to`), `order_already_moved` (the lock loser in a simultaneous transition).

**Contract tests**

| Case | Expectation |
|---|---|
| `submitted → delivered` by staff | `invalid_transition` (Story 4, scenario 3) |
| `delivered → preparing` by staff | `invalid_transition` (Story 4, scenario 4) |
| `confirmed → cancelled` by the owning customer | `not_authorized` (FR-048) |
| `submitted → cancelled` by the owning customer | Succeeds; history actor is the customer |
| `submitted → cancelled` by a different customer | `not_authorized` |
| Any transition from `cancelled` | `invalid_transition` |
| Concurrent customer-cancel and staff-confirm | One succeeds; the other gets `order_already_moved` (FR-050) |
| Every accepted transition | Exactly one history row appended (SC-010) |
| `UPDATE`/`DELETE` on `order_status_history` by any role | Refused — no policy exists (FR-047) |

---

## `register_customer(...)` — Server Action, not RPC

Registration spans Supabase Auth and the `profiles` table, so it runs as a Server Action using
the service role rather than as a database function.

**Input**: `full_name`, `phone` (any notation), `city_id`, `street_address`, `landmark`,
`building?`, `floor_apartment?`, `password`, `locale`.

**Sequence**:

1. Validate with Zod; `normalize_phone` the number (FR-009, FR-010).
2. Reject if `landmark` is blank (FR-007 — drivers cannot deliver without it).
3. Reject if the phone already exists, with "this number is already registered" (FR-011).
4. Create the Auth user with the synthetic identifier `<digits>@phone.fmcg.local` and the
   chosen password, marked confirmed (research R2).
5. Insert the `profiles` row with the **canonical phone** and `role = 'customer'`.
   `role` is never taken from input.
6. Insert the first `addresses` row with `is_default = true`.
7. Establish the session and return.

Steps 4–6 are compensated on failure: if the profile or address insert fails, the Auth user is
deleted, so a half-registered account cannot exist.

**Errors**: `invalid_phone`, `phone_taken`, `weak_password` (FR-013), `landmark_required`,
`city_inactive`.

---

## `login_customer(phone, password)` — Server Action

1. `normalize_phone` the input.
2. Check `login_attempts` for this phone; refuse with `too_many_attempts` past the threshold in
   the window (FR-014).
3. Sign in with the derived synthetic identifier and the password.
4. Record the attempt, succeeded or failed.
5. On failure return a message identical whether the number is unknown or the password wrong —
   no account enumeration.

**Errors**: `invalid_phone`, `invalid_credentials`, `too_many_attempts`, `account_inactive`.

---

## `admin_reset_password(p_profile_id uuid, p_new_password text)` — Server Action, admin only

The staff-mediated recovery path required by FR-016, since no email or SMS channel exists.

1. Verify the caller is `admin`; otherwise `not_authorized`.
2. Update the Auth user's password with the service role.
3. Write an `admin_audit_log` entry naming the actor, the target and the time.

The audit entry is not optional — a privileged operation that takes over an account must leave
a trace.
