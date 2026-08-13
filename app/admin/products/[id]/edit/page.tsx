import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ProductForm from "@/components/admin/ProductForm";

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { brand: true, category: true },
  });
  if (!product) notFound();

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Edit Product</h1>
      <ProductForm
        mode="edit"
        productId={product.id}
        initial={{
          sku: product.sku,
          name: product.name,
          brandName: product.brand.name,
          categoryName: product.category.name,
          unitsPerCarton: product.unitsPerCarton,
          cartonPrice: Number(product.cartonPrice),
          stockCartons: product.stockCartons,
          imageUrl: product.imageUrl,
        }}
      />
    </div>
  );
}
