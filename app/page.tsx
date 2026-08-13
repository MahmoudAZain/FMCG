import Link from "next/link";

export default function HomePage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16 text-center">
      <span className="stamp">B2B Wholesale</span>
      <h1 className="text-4xl font-bold mt-4 mb-3">Order FMCG supplies by the carton</h1>
      <p className="text-inkSoft max-w-xl mx-auto mb-8">
        Sign in to see your wholesale pricing, browse the full catalog, and place your next order.
      </p>
      <Link href="/products" className="bg-amber text-ink px-6 py-3 rounded font-semibold inline-block">
        Browse Catalog
      </Link>
    </div>
  );
}
