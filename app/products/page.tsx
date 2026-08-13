import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ProductGrid from "@/components/ProductGrid";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { category?: string; brand?: string; q?: string };
}) {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session;

  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(searchParams.category ? { category: { slug: searchParams.category } } : {}),
      ...(searchParams.brand ? { brand: { slug: searchParams.brand } } : {}),
      ...(searchParams.q
        ? { name: { contains: searchParams.q, mode: "insensitive" } }
        : {}),
    },
    include: { brand: true, category: true },
    orderBy: { name: "asc" },
  });

  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });

  const serialized = products.map((p) => ({
    ...p,
    cartonPrice: Number(p.cartonPrice),
  }));

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Product Catalog</h1>
      <p className="text-inkSoft text-sm mb-6">
        {isLoggedIn ? "Pricing shown is per carton at your account rate." : "Sign in to see wholesale pricing."}
      </p>
      <ProductGrid
        products={serialized}
        categories={categories}
        brands={brands}
        isLoggedIn={isLoggedIn}
        activeCategory={searchParams.category}
        activeBrand={searchParams.brand}
      />
    </div>
  );
}
