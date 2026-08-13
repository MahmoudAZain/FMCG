"use client";
import { useCart } from "@/context/CartContext";
import Link from "next/link";

export default function CartPage() {
  const { items, updateCartons, removeItem, totalCartons, subtotal } = useCart();

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center text-inkSoft">
        <p className="mb-4">Your cart is empty.</p>
        <Link href="/products" className="text-green font-semibold">Browse the catalog →</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">Your Order</h1>
      <div className="space-y-3 mb-8">
        {items.map((item) => (
          <div key={item.productId} className="bg-creamCard border border-line rounded-lg p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="font-semibold text-sm">{item.name}</div>
              <div className="text-xs text-inkSoft font-mono">{item.sku}</div>
            </div>
            <input
              type="number"
              min={1}
              value={item.cartons}
              onChange={(e) => updateCartons(item.productId, Number(e.target.value))}
              className="w-16 border border-line rounded px-2 py-1 text-sm"
            />
            <div className="w-28 text-right font-bold text-green">
              {(item.cartons * item.cartonPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <button onClick={() => removeItem(item.productId)} className="text-inkSoft">✕</button>
          </div>
        ))}
      </div>

      <div className="bg-greenDark text-cream rounded-lg p-6 max-w-sm ml-auto">
        <div className="flex justify-between text-sm mb-2">
          <span>Total cartons</span><span className="font-mono">{totalCartons}</span>
        </div>
        <div className="flex justify-between text-lg font-bold border-t border-greenPale/30 pt-3 mt-3">
          <span>Subtotal</span><span>{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
        <Link href="/checkout" className="block text-center bg-amber text-ink rounded py-3 font-semibold mt-4">
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
