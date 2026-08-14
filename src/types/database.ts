/**
 * Database types.
 *
 * Regenerate against a running local stack with `npm run gen:types`, which
 * overwrites this file from the live schema. It is committed so the app
 * type-checks in CI without a database.
 *
 * Money fields are integer **piastres** throughout — 4500 is 45.00 EGP. Nothing
 * in this file is a decimal, and nothing should become one (research R5).
 */

export type UserRole = 'customer' | 'staff' | 'admin';
export type UnitType = 'piece' | 'kilo' | 'carton' | 'pack' | 'liter';
export type StorageType = 'ambient' | 'chilled' | 'frozen';
export type DiscountType = 'percent' | 'fixed';
export type OrderStatus =
  | 'submitted'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned';

export type Locale = 'ar' | 'en';

export interface Profile {
  id: string;
  full_name: string;
  /** Canonical E.164, e.g. +201001234567. The business identity. */
  phone: string;
  role: UserRole;
  preferred_locale: Locale;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Governorate {
  id: string;
  name_ar: string;
  name_en: string;
  /** Piastres. */
  delivery_fee: number;
  /** Piastres. */
  min_order_value: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  profile_id: string;
  governorate_id: string;
  street_address: string;
  /** Required — drivers cannot find Egyptian addresses without one. */
  landmark: string;
  building: string | null;
  floor_apartment: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name_ar: string;
  name_en: string;
  slug: string;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  name_ar: string;
  name_en: string;
  slug: string;
  logo_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  brand_id: string | null;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  slug: string;
  /** Piastres. */
  price: number;
  unit: UnitType;
  pack_size: string | null;
  units_per_carton: number | null;
  weight_grams: number | null;
  barcode: string | null;
  sku: string;
  stock_qty: number;
  min_order_qty: number;
  storage: StorageType;
  is_active: boolean;
  /** Generated: normalised Arabic and English text backing trigram search. */
  search_text: string;
  created_at: string;
  updated_at: string;
}

export interface ProductPhoto {
  id: string;
  product_id: string;
  storage_path: string;
  thumb_path: string | null;
  alt_ar: string | null;
  alt_en: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

/**
 * Admin-only. Reachable exclusively through `get_product_cost` /
 * `set_product_cost` — the table itself has no grant for any client role
 * (FR-063).
 */
export interface ProductCost {
  product_id: string;
  /** Piastres. */
  cost_price: number;
  supplier_name: string | null;
  updated_at: string;
}

export interface Promotion {
  id: string;
  name_ar: string;
  name_en: string;
  discount_type: DiscountType;
  /** Percent: 1–100. Fixed: piastres off. */
  discount_value: number;
  starts_at: string;
  ends_at: string;
  product_id: string | null;
  category_id: string | null;
  brand_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  /** EG-YYMMDD-NNNN — read aloud on the phone. */
  reference: string;
  profile_id: string;
  governorate_id: string;
  status: OrderStatus;
  /** All piastres, all computed server-side. */
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  grand_total: number;
  recipient_name: string;
  recipient_phone: string;
  street_address: string;
  landmark: string;
  building: string | null;
  floor_apartment: string | null;
  governorate_name_ar: string;
  governorate_name_en: string;
  customer_note: string | null;
  idempotency_key: string;
  placed_at: string;
  delivered_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  /** Snapshot, so a rename never rewrites what was sold. */
  product_name_ar: string;
  product_name_en: string;
  unit: UnitType;
  pack_size: string | null;
  qty: number;
  /** Piastres, as charged at placement. */
  unit_price: number;
  unit_discount: number;
  line_total: number;
  promotion_id: string | null;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string | null;
  actor_role: UserRole;
  note: string | null;
  created_at: string;
}

export interface ProductPricing {
  product_id: string;
  /** Piastres. */
  base_price: number;
  effective_price: number;
  discount_amount: number;
  promotion_id: string | null;
}

// ---------------------------------------------------------------------------
// RPC payloads
// ---------------------------------------------------------------------------

/**
 * What the client sends. Identifiers and quantities only — there is no field
 * for a price, which is what makes tampering structurally pointless (FR-026).
 */
export interface CartItemInput {
  product_id: string;
  qty: number;
}

export type CartLineIssueCode =
  | 'out_of_stock'
  | 'insufficient_stock'
  | 'below_min_qty'
  | 'inactive_product';

export type CartBlockingIssueCode =
  | 'below_min_order_value'
  | 'governorate_inactive'
  | 'empty_cart';

export interface CartLineIssue {
  code: CartLineIssueCode;
  available_qty?: number;
  min_order_qty?: number;
}

export interface CartLine {
  product_id: string;
  name_ar: string;
  name_en: string;
  unit: UnitType;
  pack_size: string | null;
  qty: number;
  unit_price: number;
  unit_discount: number;
  line_total: number;
  promotion_id: string | null;
  available: boolean;
  issues: CartLineIssue[];
}

export interface CartPreview {
  lines: CartLine[];
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  grand_total: number;
  min_order_value: number;
  meets_minimum: boolean;
  shortfall: number;
  blocking_issues: { code: CartBlockingIssueCode; shortfall?: number }[];
}

export interface PlacedOrder {
  order_id: string;
  reference: string;
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  grand_total: number;
  status: OrderStatus;
  placed_at: string;
  /** True when a repeated submission returned the existing order (FR-038). */
  idempotent_replay: boolean;
}

/** Typed errors raised by place_order. */
export type PlaceOrderError =
  | 'not_authenticated'
  | 'empty_cart'
  | 'address_not_found'
  | 'governorate_inactive'
  | 'product_unavailable'
  | 'insufficient_stock'
  | 'below_min_qty'
  | 'below_min_order_value';

/** Typed errors raised by set_order_status. */
export type SetOrderStatusError =
  | 'not_authenticated'
  | 'order_not_found'
  | 'not_authorized'
  | 'invalid_transition'
  | 'order_already_moved';
