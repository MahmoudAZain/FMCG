"use client";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useCart } from "@/context/CartContext";

export default function SiteHeader() {
  const { data: session } = useSession();
  const { totalCartons } = useCart();
  const role = (session?.user as any)?.role;

  return (
    <header className="border-b border-line bg-creamCard sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight text-greenDark uppercase" style={{ fontFamily: "Georgia, serif" }}>
          Your Company
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/products">Products</Link>
          {role === "ADMIN" && <Link href="/admin/products">Admin</Link>}
          <Link href="/cart" className="flex items-center gap-1">
            Cart {totalCartons > 0 && <span className="bg-amber text-ink rounded-full text-xs px-2 py-0.5 font-mono">{totalCartons}</span>}
          </Link>
          {session ? (
            <button onClick={() => signOut({ callbackUrl: "/" })} className="text-inkSoft">
              Sign out
            </button>
          ) : (
            <Link href="/account/login" className="bg-green text-cream px-3 py-1.5 rounded">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
