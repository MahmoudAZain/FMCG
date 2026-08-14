import { createClient } from '@/lib/supabase/server';

/**
 * Order reads.
 *
 * No `.eq('profile_id', ...)` appears anywhere below, and that is deliberate:
 * the policy on `orders` already restricts every read to the caller's own rows.
 * Adding a filter would imply the filter is what protects the data, and invite
 * someone to remove it later "because RLS covers it" — the wrong lesson in the
 * wrong direction. Staff see every order through the same queries, because the
 * same policy grants them that (FR-062).
 */

export interface OrderSummary {
  id: string;
  reference: string;
  status: string;
  grand_total: number;
  placed_at: string;
  item_count: number;
}

export async function getMyOrders(): Promise<OrderSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('orders')
    .select('id, reference, status, grand_total, placed_at, order_items(id)')
    .order('placed_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((o) => ({
    id: o.id,
    reference: o.reference,
    status: o.status,
    grand_total: o.grand_total,
    placed_at: o.placed_at,
    item_count: (o.order_items as { id: string }[]).length,
  }));
}

export async function getOrderByReference(reference: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('orders')
    .select(
      `id, reference, status, subtotal, discount_total, delivery_fee, grand_total,
       recipient_name, recipient_phone, street_address, landmark, building, floor_apartment,
       governorate_name_ar, governorate_name_en, customer_note,
       placed_at, delivered_at, cancelled_at,
       order_items(id, product_name_ar, product_name_en, unit, pack_size, qty,
                   unit_price, unit_discount, line_total),
       order_status_history(id, from_status, to_status, actor_role, note, created_at)`,
    )
    .eq('reference', reference)
    .maybeSingle();

  return data;
}
