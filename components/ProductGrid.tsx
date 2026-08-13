"use client";
import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";

type Product = {
  id: string;
  sku: string;
  name: string;
  unitsPerCarton: number;
  cartonPrice: number;
  stockCartons: number;
  imageUrl: string | null;
  brand: { name: string; slug: string };
  category: { name: string; slug: string };
};

export default function ProductGrid({
  products,
  categories,
  brands,
  isLoggedIn,
  activeCategory,
  activeBrand,
}: {
  products: Product[];
  categories: { name: string; slug: string }[];
  brands: { name: string; slug: string }[];
  isLoggedIn: boolean;
  activeCategory?: string;
  activeBrand?: string;
}) {
  return (
    <div className="flex gap-8">
      <aside className="w-52 shrink-0 hidden md:block">
        <div className="mb-6">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-inkSoft mb-2">Category</h3>
          <FilterList param="category" items={categories} active={activeCategory} />
        </div>
        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-inkSoft mb-2">Brand</h3>
          <FilterList param="brand" items={brands} active={activeBrand} />
        </div>
      </aside>

      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} isLoggedIn={isLoggedIn} />
        ))}
        {products.length === 0 && <p className="text-inkSoft text-sm">No products match these filters.</p>}
      </div>
    </div>
  );
}

function FilterList({
  param,
  items,
  active,
}: {
  param: "category" | "brand";
  items: { name: string; slug: string }[];
  active?: string;
}) {
  return (
    <ul className="space-y-1 text-sm">
      <li>
        <Link href="/products" className={!active ? "font-bold text-green" : "text-inkSoft"}>
          All
        </Link>
      </li>
      {items.map((i) => (
        <li key={i.slug}>
          <Link href={`/products?${param}=${i.slug}`} className={active === i.slug ? "font-bold text-green" : "text-inkSoft"}>
            {i.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProductCard({ product, isLoggedIn }: { product: Product; isLoggedIn: boolean }) {
  const [cartons, setCartons] = useState(1);
  const { addItem } = useCart();
  const outOfStock = product.stockCartons <= 0;

  return (
    <div className="bg-creamCard border border-line rounded-lg p-4 flex flex-col gap-2">
      <div className="w-full aspect-square bg-greenPale rounded flex items-center justify-center overflow-hidden">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} className="object-cover w-full h-full" />
        ) : (
          <span className="text-inkSoft text-xs">No photo</span>
        )}
      </div>
      <span className="text-xs text-inkSoft font-mono">{product.sku}</span>
      <h3 className="font-semibold text-sm leading-snug">{product.name}</h3>
      <p className="text-xs text-inkSoft">{product.brand.name} · {product.unitsPerCarton} pcs / carton</p>

      {isLoggedIn ? (
        <>
          <div className="font-bold text-green text-lg">
            {product.cartonPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="text-xs font-medium text-inkSoft"> / carton</span>
          </div>
          {outOfStock ? (
            <span className="text-xs text-brick font-semibold">Out of stock</span>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={product.stockCartons}
                  value={cartons}
                  onChange={(e) => setCartons(Math.max(1, Number(e.target.value)))}
                  className="w-16 border border-line rounded px-2 py-1 text-sm"
                />
                <span className="text-xs text-inkSoft">cartons</span>
              </div>
              <button
                onClick={() =>
                  addItem(
                    {
                      productId: product.id,
                      sku: product.sku,
                      name: product.name,
                      cartonPrice: product.cartonPrice,
                      unitsPerCarton: product.unitsPerCarton,
                      imageUrl: product.imageUrl,
                    },
                    cartons
                  )
                }
                className="bg-amber text-ink rounded py-2 text-sm font-semibold mt-1"
              >
                Add to order
              </button>
            </>
          )}
        </>
      ) : (
        <Link href="/account/login" className="text-sm text-green font-semibold mt-1">
          Sign in to see price →
        </Link>
      )}
    </div>
  );
}
