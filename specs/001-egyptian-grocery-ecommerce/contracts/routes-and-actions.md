# Contract: Routes, Server Actions, and UI Surface

**Feature**: `specs/001-egyptian-grocery-ecommerce`

Every route is prefixed by a locale segment — `/ar/...` (default) or `/en/...`. Middleware
resolves the locale from cookie then `Accept-Language`, defaulting to `ar`, and redirects a
bare `/` accordingly (FR-001, FR-004).

---

## Storefront routes

| Route | Rendering | Purpose | Requirements |
|---|---|---|---|
| `/[locale]` | Server | Home: categories, promoted products, search entry | FR-017, FR-020 |
| `/[locale]/c/[...slug]` | Server | Category listing, nested, paginated | FR-017, FR-018, FR-023 |
| `/[locale]/p/[slug]` | Server | Product detail: photos, both languages, price | FR-021, FR-022 |
| `/[locale]/search?q=` | Server | Search results in either language | FR-019 |
| `/[locale]/offers` | Server | All currently discounted products | FR-020 |
| `/[locale]/cart` | Client shell + server pricing | Cart with server-computed totals | FR-024, FR-025 |
| `/[locale]/checkout` | Server | Address selection, final totals, place order | FR-030, FR-031, FR-036 |
| `/[locale]/orders` | Server | Own order history, newest first | FR-062 |
| `/[locale]/orders/[reference]` | Server | Own order detail with status timeline | FR-048, FR-062 |
| `/[locale]/account` | Server | Profile and address management | FR-015 |
| `/[locale]/login` | Server | Phone + password sign-in | FR-012 |
| `/[locale]/register` | Server | Registration | FR-007 |

**Data access on public routes** uses the anon key with RLS applied — inactive products,
future promotions and other customers' data are invisible at the database level, not by query
construction (Principle II).

---

## Admin routes

All under `/[locale]/admin`. Middleware redirects non-staff for a clean experience; the layout
re-checks per request; RLS refuses the data regardless (FR-064, FR-065, research R16).

| Route | Minimum role | Purpose | Requirements |
|---|---|---|---|
| `/admin` | staff | Dashboard: order counts by state | FR-058 |
| `/admin/orders` | staff | Queue with filters by state, city, date; search by reference or phone | FR-058 |
| `/admin/orders/[id]` | staff | Detail, status transitions, history timeline | FR-044–FR-049 |
| `/admin/products` | admin | Product list with stock and status | FR-051 |
| `/admin/products/new`, `/admin/products/[id]` | admin | Full product form, both languages, photos, cost | FR-051, FR-054, FR-059 |
| `/admin/categories` | admin | Tree management, reorder, activate | FR-053 |
| `/admin/brands` | admin | Brand management | FR-053 |
| `/admin/promotions` | admin | Promotions with scope and date range | FR-055 |
| `/admin/cities` | admin | Cities with fee and minimum order value | FR-056 |
| `/admin/staff` | admin | Staff accounts, roles, password reset | FR-016, FR-060 |

**The staff/admin split** exists because FR-060 requires ordinary staff to process orders
without reaching cost prices. Staff see `/admin/orders`; everything touching price, promotion
or cost is admin-only, and `product_costs` has no staff grant at all.

---

## Server Actions

All mutations are Server Actions. Every one validates input with Zod before touching the
database, and **no action accepts a price, discount, fee or total from the client** (FR-026).

### Authentication

| Action | Input | Notes |
|---|---|---|
| `registerCustomer` | name, phone, city, address, landmark, password, locale | Contract in [rpc-contracts.md](rpc-contracts.md). Compensating delete on partial failure |
| `loginCustomer` | phone, password | Rate-limited per phone (FR-014); identical message for unknown number and wrong password |
| `logout` | — | Clears the session cookie |

### Customer

| Action | Input | Calls | Requirements |
|---|---|---|---|
| `previewCart` | `[{product_id, qty}]`, `city_id` | `price_cart` | FR-025 |
| `placeOrder` | `[{product_id, qty}]`, `address_id`, `idempotency_key`, `note?` | `place_order` | FR-025, FR-037, FR-038 |
| `cancelMyOrder` | `order_id` | `set_order_status(..., 'cancelled')` | FR-048 |
| `addAddress` / `updateAddress` / `deleteAddress` / `setDefaultAddress` | address fields | direct, RLS-scoped | FR-015 |
| `updateProfile` | full name, preferred locale | direct, RLS-scoped | FR-004 |

`placeOrder` receives **only** product identifiers and quantities. Its idempotency key is
generated when the checkout page mounts, so a double-tap or a resubmit produces one order
(FR-038).

### Staff

| Action | Input | Calls | Requirements |
|---|---|---|---|
| `transitionOrder` | `order_id`, `new_status`, `note?` | `set_order_status` | FR-044–FR-047, FR-049 |

### Admin

| Action | Requirements |
|---|---|
| `createProduct` / `updateProduct` | FR-051, FR-057 — refuses a missing `name_ar` or `name_en` |
| `setProductCost` | FR-059 — writes `product_costs`, admin only |
| `uploadProductPhoto` / `reorderPhotos` / `setPrimaryPhoto` / `deletePhoto` | FR-054 |
| `createCategory` / `updateCategory` / `reorderCategories` | FR-053 |
| `createBrand` / `updateBrand` | FR-053 |
| `createPromotion` / `updatePromotion` | FR-055 |
| `createCity` / `updateCity` | FR-056 |
| `createStaffAccount` / `updateStaffRole` | FR-060 |
| `adminResetPassword` | FR-016 — writes `admin_audit_log` |

**Deactivate, never delete** (FR-061): admin actions on categories, brands, products and cities
set `is_active = false` rather than deleting. `ON DELETE RESTRICT` on the foreign keys makes
this structural — an attempted delete of anything an order references fails at the database.

---

## Validation contract (Zod, shared client and server)

| Field | Rule | Requirement |
|---|---|---|
| `full_name` | 2–120 chars, non-blank | FR-007 |
| `phone` | Normalizes to `^\+201[0-25][0-9]{8}$` | FR-009, FR-010 |
| `password` | ≥ 8 chars, at least one letter and one digit | FR-013 |
| `street_address` | 5–300 chars | FR-007 |
| `landmark` | **3–200 chars, required** | FR-007 |
| `qty` | Integer ≥ 1, ≥ product `min_order_qty` | FR-032 |
| `name_ar`, `name_en` | Both required, 2–200 chars | FR-005, FR-057 |
| `price`, `cost_price`, `delivery_fee`, `min_order_value` | Integer piastres ≥ 0; `price` > 0 | Research R5 |
| `discount_value` | `percent`: 1–100; `fixed`: > 0 piastres | FR-055 |
| `starts_at` / `ends_at` | `ends_at > starts_at` | FR-055 |

Client-side validation is a courtesy that saves a round trip. The server repeats every check,
and the database repeats the ones that protect money or integrity. A rule that exists only in
the browser does not exist.

---

## UI contract — mobile-first and RTL

Per Constitution Principle IV and FR-002:

- Designed at 360px first; breakpoints add columns upward. No horizontal overflow at 360px in
  either direction (SC-012).
- **Logical properties only** — `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`,
  `text-start`, `text-end`. Physical `left`/`right` utilities are blocked by lint rule.
- `dir` is set server-side on `<html>` in the locale layout, so there is no flash of wrong
  direction on first paint.
- Touch targets ≥ 44×44 CSS pixels.
- Product images: explicit dimensions, `loading="lazy"` below the fold, `sizes` matched to the
  mobile grid.
- Prices via `Intl.NumberFormat(locale, {currency:'EGP'})`, formatting the integer piastre value
  at the render boundary only.
- The language switcher links to the same pathname under the other locale; the cart lives in
  `localStorage` and is untouched by the switch (FR-003).
- Icons that encode direction (back arrows, chevrons) mirror with the layout; icons that do not
  (search, cart) never mirror.

---

## Scheduled work

| Job | Schedule | Purpose |
|---|---|---|
| Keep-alive | Every 6 hours | One trivial query, preventing free-tier pausing after 7 idle days (FR-069, research R13) |
| Login-attempt sweep | Daily | Delete `login_attempts` older than 24h, bounding the table |
| Orphan image sweep | Weekly | Remove storage objects no `product_photos` row references (research R12) |
| Data export | Weekly | Export master data and orders — the free tier has **no backups** (research R13) |

Cloudflare Cron Triggers are included in the Workers free tier, so all four cost nothing.
