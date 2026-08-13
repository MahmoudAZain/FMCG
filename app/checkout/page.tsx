"use client";
import { useCart } from "@/context/CartContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function CheckoutPage() {
  const { items, subtotal, totalCartons, clear } = useCart();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  if (status === "loading") return null;

  if (!session) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <p className="mb-4 text-inkSoft">Sign in to place your order.</p>
        <Link href="/account/login" className="bg-green text-cream px-6 py-2.5 rounded font-semibold">Sign in</Link>
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="max-w-md mx-auto px-6 py-16 text-center text-inkSoft">Your cart is empty.</div>;
  }

  async function placeOrder() {
    setPlacing(true);
    setError("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    setPlacing(false);
    if (!res.ok) {
      setError(data.error || "Could not place order.");
      return;
    }
    clear();
    router.push(`/account/orders/${data.id}?placed=1`);
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">Review &amp; Confirm</h1>
      <div className="bg-creamCard border border-line rounded-lg p-5 mb-6">
        {items.map((i) => (
          <div key={i.productId} className="flex justify-between text-sm py-1.5">
            <span>{i.cartons} × {i.name}</span>
            <span className="font-mono">{(i.cartons * i.cartonPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
        <div className="border-t border-line mt-3 pt-3 flex justify-between font-bold">
          <span>Total ({totalCartons} cartons)</span>
          <span>{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
      {error && <p className="text-brick text-sm mb-3">{error}</p>}
      <button onClick={placeOrder} disabled={placing} className="w-full bg-amber text-ink rounded py-3 font-semibold">
        {placing ? "Placing order…" : "Submit purchase order"}
      </button>
    </div>
  );
}
