import { prisma } from "@/lib/prisma";
import Link from "next/link";
import ToggleActiveButton from "@/components/admin/ToggleActiveButton";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({
    include: { brand: true, category: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Products ({products.length})</h1>
      <div className="bg-creamCard border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_100px_90px_90px_80px] gap-2 px-4 py-2.5 bg-line/40 text-xs font-bold uppercase text-inkSoft">
          <span>Product</span><span>Brand</span><span>Price/Ctn</span><span>Stock</span><span>Status</span><span></span>
        </div>
        {products.map((p) => (
          <div key={p.id} className="grid grid-cols-[1fr_100px_100px_90px_90px_80px] gap-2 px-4 py-3 border-t border-line items-center text-sm">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-inkSoft font-mono">{p.sku}</div>
            </div>
            <span className="text-xs">{p.brand.name}</span>
            <span className="font-mono">{Number(p.cartonPrice).toFixed(2)}</span>
            <span className={p.stockCartons === 0 ? "text-brick font-semibold" : ""}>{p.stockCartons}</span>
            <ToggleActiveButton id={p.id} active={p.active} />
            <Link href={`/admin/products/${p.id}/edit`} className="text-green font-semibold text-xs">Edit</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
