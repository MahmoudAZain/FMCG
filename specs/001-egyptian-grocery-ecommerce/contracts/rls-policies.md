# Contract: Row Level Security Policies

**Feature**: `specs/001-egyptian-grocery-ecommerce`

Constitution Principle II requires that a route which forgets its authorization check still
returns nothing. These policies are that guarantee. Application-layer checks exist only so the
user sees a clean "not allowed" page instead of an empty one.

---

## Helper functions

Both are `SECURITY DEFINER` and `STABLE`. `SECURITY DEFINER` is required because a policy on
`profiles` that itself queries `profiles` would recurse; a definer-rights function reads the
row without re-entering policy evaluation.

```sql
CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS user_role LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT COALESCE(public.current_role_name() IN ('staff','admin'), false)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT COALESCE(public.current_role_name() = 'admin', false)
$$;
```

`SET search_path = public` on every `SECURITY DEFINER` function is mandatory — without it a
caller can manipulate `search_path` to make the function resolve a different table.

The `is_active` filter means a deactivated staff account loses its powers immediately, while
its history entries remain intact and attributed (Edge Cases, FR-061).

---

## Baseline grants

```sql
-- Deny by default, then grant deliberately.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- product_costs is never granted to anon or authenticated at all.
-- This is the structural guarantee behind FR-063 and SC-008: a customer asking
-- for cost data receives a permission error, not a filtered result.
```

Every table below has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. A table without RLS enabled
must not reach the default branch (Constitution, Development Workflow gates).

---

## `profiles`

```sql
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_staff());

CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_admin_all ON profiles
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
```

**Privilege-escalation guard.** `profiles_update_own` permits a customer to update their own
row, and RLS cannot restrict *which columns* an update touches. Without the trigger below, any
customer could set `role = 'admin'` on themselves:

```sql
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized: role and is_active are admin-only';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER profiles_guard_privileged
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();
```

---

## `addresses`

```sql
CREATE POLICY addresses_own ON addresses
  FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY addresses_staff_read ON addresses
  FOR SELECT TO authenticated
  USING (is_staff());
```

`WITH CHECK` matters as much as `USING`: without it a customer could insert an address
attributed to another customer's profile.

---

## Catalog tables

```sql
-- governorates, categories, brands, products: identical shape
CREATE POLICY <t>_public_read ON <t>
  FOR SELECT TO anon, authenticated
  USING (is_active OR is_staff());

CREATE POLICY <t>_admin_write ON <t>
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
```

```sql
CREATE POLICY product_photos_public_read ON product_photos
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM products p
                 WHERE p.id = product_id AND (p.is_active OR is_staff())));

CREATE POLICY product_photos_admin_write ON product_photos
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
```

```sql
CREATE POLICY promotions_public_read ON promotions
  FOR SELECT TO anon, authenticated
  USING ((is_active AND now() BETWEEN starts_at AND ends_at) OR is_staff());

CREATE POLICY promotions_admin_write ON promotions
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
```

Customers cannot read future or expired promotions at all — a promotion is invisible until it
is live (FR-028, Story 3 scenario 3).

---

## `product_costs` — admin only, reached through a function

```sql
ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_costs_admin_only ON product_costs
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- No grant to anon. No grant to authenticated. None at all.
-- get_product_cost() / set_product_cost() are the only door, and they RAISE
-- for a non-admin rather than returning nothing.
```

**Why a function rather than a grant** *(established during implementation)*:
Supabase gives every signed-in user the same database role, `authenticated`. A table-level grant
therefore cannot distinguish an admin from a customer — grant-plus-policy would return an *empty
set* to a customer, and an empty set is indistinguishable from "no cost recorded". Principle II
asks for a guarantee, not an ambiguity. Revoking the grant entirely and routing admin access
through `SECURITY DEFINER` accessors makes a customer's attempt a hard `permission denied`, and
the accessor's own `is_admin()` check makes the function call a hard `not_authorized`.

This is a separate table rather than a column on `products` precisely so that the guarantee is
structural. A cost column would rely on every query, forever, remembering to omit it — and one
`select('*')` in one future admin route would leak it. FR-063 and SC-008 demand more than
discipline.

---

## `orders`

```sql
CREATE POLICY orders_select_own ON orders
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR is_staff());
```

**No `INSERT` policy exists for any role.** Orders are created exclusively by `place_order`,
which is `SECURITY DEFINER` and therefore bypasses RLS. This is what makes FR-025 structural:
there is no route by which a client can insert an order at a price of its own choosing.

**No `UPDATE` policy exists either.** Status changes go through `set_order_status`, which
enforces the transition table and writes history atomically. Allowing a direct update would let
a customer set `status = 'delivered'` on their own order, or skip the history entry that FR-046
requires.

---

## `order_items`

```sql
CREATE POLICY order_items_select_own ON order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o
                 WHERE o.id = order_id
                   AND (o.profile_id = auth.uid() OR is_staff())));
```

No `INSERT`, `UPDATE` or `DELETE` policy for any role — items exist only as written by
`place_order`, so the price snapshot (FR-034) cannot be rewritten after the fact.

---

## `order_status_history` — append-only

```sql
CREATE POLICY osh_select_own ON order_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o
                 WHERE o.id = order_id
                   AND (o.profile_id = auth.uid() OR is_staff())));
```

**No `INSERT`, `UPDATE` or `DELETE` policy exists for any role, including admin.** Rows are
written only inside `set_order_status` and `place_order`. There is no route through which a
history row can be altered or removed — which is exactly what FR-047 requires and SC-010
measures. When a driver and a customer disagree, this log is the only evidence that exists;
it is worth nothing if anyone can edit it.

---

## `report_exports`

```sql
ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_exports_admin_read ON report_exports
  FOR SELECT TO authenticated USING (is_admin());
-- No INSERT/UPDATE/DELETE policy: rows are written by the SECURITY DEFINER
-- export path only, so the record of what left the system cannot be edited
-- by whoever exported it.
```

Report functions themselves are protected by their own guards rather than by table policies:
the staff-visible functions have no cost column in their return type, and the two admin-only
functions (`report_product_margin`, `report_profit_by_day`) call `is_admin()` and **raise** for
any other caller. Raising rather than returning empty matters — an empty result is
indistinguishable from an empty date range, so silence would enforce nothing (FR-078, SC-018).

## `login_attempts` and `admin_audit_log`

```sql
-- login_attempts: no policy for any client role.
-- Written and read only by SECURITY DEFINER functions.
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_admin_read ON admin_audit_log
  FOR SELECT TO authenticated USING (is_admin());
-- No INSERT/UPDATE/DELETE policy: writes come from SECURITY DEFINER functions only.
```

---

## Storage policies — `product-images`

```sql
CREATE POLICY product_images_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images');

CREATE POLICY product_images_admin_write ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-images' AND is_admin())
  WITH CHECK (bucket_id = 'product-images' AND is_admin());
```

Product photos are public by design — they are shown to anonymous browsers, and public reads
are served from Cloudflare's cache rather than counting against Supabase egress.

---

## Verification matrix

These are the assertions the RLS test suite must make (research R15). Each runs under a real
JWT for the stated role, not with the service role.

| # | Actor | Attempt | Required result |
|---|---|---|---|
| 1 | Customer A | `SELECT` Customer B's profile | 0 rows |
| 2 | Customer A | `SELECT` Customer B's addresses | 0 rows |
| 3 | Customer A | `SELECT` Customer B's orders | 0 rows |
| 4 | Customer A | `SELECT` order_items of B's order | 0 rows |
| 5 | Customer A | `SELECT` history of B's order | 0 rows |
| 6 | Customer A | `SELECT` from `product_costs` | permission denied |
| 7 | Staff | `SELECT` from `product_costs` | permission denied |
| 8 | Admin | `SELECT` from `product_costs` | rows returned |
| 9 | Customer A | `INSERT` into `orders` directly | denied — no policy |
| 10 | Customer A | `UPDATE orders SET grand_total = 1` | denied — no policy |
| 11 | Customer A | `UPDATE orders SET status = 'delivered'` | denied — no policy |
| 12 | Customer A | `UPDATE profiles SET role = 'admin'` on own row | trigger raises `not_authorized` |
| 13 | Customer A | `INSERT` address with B's `profile_id` | `WITH CHECK` violation |
| 14 | Any role | `UPDATE` or `DELETE` on `order_status_history` | denied — no policy |
| 15 | Customer A | `UPDATE products SET price = 1` | **0 rows affected** — see note |
| 16 | Staff | `UPDATE products SET price = 1` | **0 rows affected** — see note |
| 17 | Anonymous | `SELECT` inactive product | 0 rows |
| 18 | Anonymous | `SELECT` future-dated promotion | 0 rows |
| 19 | Customer A | `SELECT` from `login_attempts` | permission denied |
| 20 | Staff | `SELECT` from `admin_audit_log` | permission denied |
| 21 | Staff | Call `report_product_margin()` | raises `not_authorized` |
| 22 | Staff | Call `report_profit_by_day()` | raises `not_authorized` |
| 23 | Customer A | Call any `report_*` function | raises `not_authorized` |
| 24 | Staff | `SELECT` from `report_exports` | permission denied |

**How RLS refuses a write** *(established during implementation)*: a `USING` clause filters the
row out of the statement's scope, so a forbidden `UPDATE` **succeeds and changes nothing** rather
than raising. The guarantee is "zero rows affected", not "error". This matters for the
application: code that treats a successful `UPDATE` as proof of a change would be wrong, so
admin actions check the affected row count rather than merely the absence of an exception. The
test suite asserts the row count for exactly this reason.

Assertions 1–8 back SC-007 and SC-008 directly; 21–24 extend SC-008 to the reporting surface, where exports serialize whatever the query returned. Assertions 9–11 are what make Principle I
enforceable rather than aspirational: even with a valid session and a crafted request, there is
no way to write a price the database did not compute.
