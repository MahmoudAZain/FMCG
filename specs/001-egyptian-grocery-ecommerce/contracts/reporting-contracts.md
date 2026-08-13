# Contract: Reporting, Dashboard and Exports

**Feature**: `specs/001-egyptian-grocery-ecommerce` · **User Story 7**

Aggregation runs in Postgres, never in the Worker (research R17). Dates bucket in Egypt local
time (R18). Money is stored and returned as integer piastres, converted to decimal EGP only at
the export boundary (R19).

---

## Shared parameters

Every report function takes `p_from date, p_to date`, inclusive of both endpoints, interpreted
as **Egypt local dates**. All are `STABLE`.

**Revenue** means orders that reached `delivered`, attributed to `cairo_date(delivered_at)`.
Cancelled and returned orders are reported as separate figures and never netted into revenue
(FR-072).

---

## Staff-visible reports

Ordinary staff and administrators may call these. **None has a cost, margin or profit column in
its return type** — not a suppressed one, not a nulled one (research R20, FR-078).

### `report_summary(p_from, p_to)`

```
revenue            integer  -- piastres, delivered orders only
orders_placed      integer
orders_delivered   integer
orders_cancelled   integer
orders_returned    integer
orders_in_progress integer  -- booked but not yet delivered
avg_order_value    integer  -- piastres, delivered orders
items_sold         integer
cancellation_rate  numeric  -- cancelled / placed
return_rate        numeric  -- returned / delivered
new_customers      integer  -- first order falls inside the range
```

### `report_sales_by_day(p_from, p_to)`

Per Cairo day: `day date, orders_delivered, revenue, discount_total, delivery_fees, items_sold`.
Days with no activity are returned as zero rows rather than omitted, so a chart has no gaps.

### `report_sales_by_product(p_from, p_to)`

Per product: `product_id, name_ar, name_en, sku, unit, units_sold, revenue, order_count`.
Names come from the **order line snapshot**, so a product renamed or deactivated after selling
still reports correctly (Edge Cases).

### `report_sales_by_category(p_from, p_to)` · `report_sales_by_governorate(p_from, p_to)`

Per category: `category_id, name_ar, name_en, units_sold, revenue`.
Per governorate: `governorate_id, name_ar, name_en, orders, revenue, delivery_fees, avg_order_value`.

### `report_customers(p_from, p_to)`

```
new_customers        integer
returning_customers  integer
total_customers      integer  -- registered as at p_to
top_customers        jsonb    -- [{profile_id, full_name, phone, orders, total_spent}]
```

### `report_promotions(p_from, p_to)`

Per promotion: `promotion_id, name_ar, name_en, orders, revenue, discount_given`. Attribution
comes from `order_items.promotion_id`, recorded at placement — so it reflects the promotion that
actually applied, not one reconstructed from today's rules.

### `report_low_stock(p_threshold integer)`

`product_id, name_ar, name_en, sku, stock_qty, min_order_qty`. Not range-bound — it reports the
present.

---

## Admin-only reports

Guarded by `is_admin()`. On a non-admin caller they **raise `not_authorized`** rather than
returning an empty set — an empty result is indistinguishable from an empty date range, and
silence enforces nothing.

### `report_product_margin(p_from, p_to)`

`product_id, name_ar, name_en, units_sold, revenue, cost_total, gross_margin, margin_pct`

### `report_profit_by_day(p_from, p_to)`

`day date, revenue, cost_total, gross_profit`

**Cost basis**: margin uses each product's **current** cost price, because the system stores one
cost per product rather than a cost history. Every margin report states this on its face, so no
one mistakes it for audited historical margin. Cost history is a later change if the business
wants it.

---

## Routes

| Route | Minimum role | Purpose |
|---|---|---|
| `/[locale]/admin` | staff | Dashboard: summary tiles, sales trend, top products, low stock |
| `/[locale]/admin/reports` | staff | Report index with the shared date-range control |
| `/[locale]/admin/reports/sales` | staff | By day, product, category, governorate |
| `/[locale]/admin/reports/customers` | staff | New, returning, top customers |
| `/[locale]/admin/reports/promotions` | staff | Promotion performance |
| `/[locale]/admin/reports/inventory` | staff | Low stock and stock valuation *(valuation admin-only)* |
| `/[locale]/admin/reports/profit` | **admin** | Margin and profit — hidden from the staff navigation entirely |

The staff navigation does not render a link to `/reports/profit`, the route rejects a staff
session, and the underlying functions raise for a non-admin caller. Three layers, of which only
the last is the actual boundary (FR-078, SC-018).

---

## Export contract

### `GET /api/reports/[key]/export?format=csv|xlsx&from=&to=`

1. Resolve the session and the caller's role. Reject an unauthorized report key with 403.
2. Call the same report function the screen calls, with the same range — so file and screen
   cannot disagree (FR-081).
3. Return 200 with an "empty range" marker if there are no rows; the UI tells the user rather
   than handing over a headers-only file (FR-083).
4. Write a `report_exports` audit row: actor, report key, range, format, row count (FR-085).
5. Stream the response with `Content-Disposition: attachment`.

### CSV encoding — the part that decides whether the file is usable

| Rule | Why |
|---|---|
| **UTF-8 with a byte-order mark (`EF BB BF`)** | Without it, Excel on Windows opens the file in the system codepage and Arabic product names render as `Ù„Ø¨Ù†` instead of `لبن`. This single detail decides whether the export is usable for a bilingual Egyptian business (FR-080, SC-020). |
| CRLF line endings, RFC 4180 quoting | Fields quoted, embedded quotes doubled. |
| Values starting `=`, `+`, `-`, `@` prefixed with `'` | Formula-injection guard. A product name is data and must never be evaluated when the file opens. |
| Money as decimal EGP (`45.00`) | Converted from piastres at serialization. An accountant should not divide by 100. |
| Dates as `YYYY-MM-DD`, Cairo local | Matches what the screen showed. |
| Bilingual headers (`اسم المنتج / Product`) | The file is read by the same bilingual staff as the site. |

### XLSX

Generated **in the browser** by dynamically importing a writer only on the reports route
(research R19). Server-side XLSX means zipping XML inside a 10 ms CPU budget; the browser does
it free, the storefront bundle never sees the library, and the file gets real number formats,
column widths and RTL sheet direction for the Arabic view.

The server returns JSON via the same function; the client writes the workbook. Numbers are
written as numbers, not strings, so the recipient can sum a column without cleaning it first.

---

## Contract tests

| Case | Expectation |
|---|---|
| Summary figures vs. the underlying orders | Reconcile exactly (SC-017) |
| Cancelled order inside the range | Excluded from revenue; counted in `orders_cancelled` |
| Returned order | Excluded from revenue; counted in `orders_returned` |
| Order delivered at 00:10 Cairo | Falls on that day, not the previous UTC day (FR-073) |
| Order delivered at 23:50 Cairo | Falls on that day, not the next |
| Range spanning a summer-time transition | Day boundaries stay correct |
| Staff calls `report_product_margin` | Raises `not_authorized` |
| Staff exports every permitted report | No cost, margin or profit column in any file (SC-018) |
| Admin exports a margin report | Cost and margin present |
| Export vs. screen, same range | Identical rows and totals (FR-081) |
| CSV containing Arabic names | First three bytes are `EF BB BF`; Arabic renders in Excel |
| Product name `=SUM(A1:A9)` | Written prefixed with `'`; not evaluated on open |
| Empty date range | Empty-range marker, not a headers-only file (FR-083) |
| 5,000-row export | Completes without timeout (FR-084, SC-020) |
| Product renamed after selling | Report shows the name recorded on the order |
| Dashboard over a full month | Renders within 2 seconds (SC-019) |
| Any export | Writes exactly one `report_exports` row (FR-085) |
