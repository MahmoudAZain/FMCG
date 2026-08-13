import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Middleware also gates /admin, but middleware alone is not a sufficient
// authorization boundary (see CVE-2025-29927). Every admin page renders through
// this layout, so the session is re-checked on the server on every request.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/account/login");
  if ((session.user as any)?.role !== "ADMIN") redirect("/products");

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex gap-6 text-sm font-semibold mb-8 border-b border-line pb-3">
        <Link href="/admin/products">Products</Link>
        <Link href="/admin/products/new">Add Product</Link>
        <Link href="/admin/products/import">Bulk Import</Link>
        <Link href="/admin/orders">Orders</Link>
      </div>
      {children}
    </div>
  );
}
