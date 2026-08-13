import ProductForm from "@/components/admin/ProductForm";

export default function NewProductPage() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Add Product</h1>
      <ProductForm mode="new" />
    </div>
  );
}
