"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mode: "new" | "edit";
  productId?: string;
  initial?: {
    sku: string;
    name: string;
    brandName: string;
    categoryName: string;
    unitsPerCarton: number;
    cartonPrice: number;
    stockCartons: number;
    imageUrl: string | null;
  };
};

export default function ProductForm({ mode, productId, initial }: Props) {
  const [form, setForm] = useState(
    initial || {
      sku: "",
      name: "",
      brandName: "",
      categoryName: "",
      unitsPerCarton: 12,
      cartonPrice: 0,
      stockCartons: 0,
      imageUrl: "" as string | null,
    }
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError("Image is larger than 4 MB. Please resize it and try again.");
      e.target.value = "";
      return;
    }
    setError("");
    setUploading(true);
    const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
      method: "POST",
      body: file,
    });
    const data = await res.json();
    setUploading(false);
    if (res.ok) setForm((f) => ({ ...f, imageUrl: data.url }));
    else setError(data.error || "Upload failed.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const url = mode === "new" ? "/api/admin/products" : `/api/admin/products/${productId}`;
    const method = mode === "new" ? "POST" : "PUT";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not save product.");
      return;
    }
    router.push("/admin/products");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <Row label="SKU">
        <input
          required
          disabled={mode === "edit"}
          value={form.sku}
          onChange={(e) => setForm({ ...form, sku: e.target.value })}
          className="input"
        />
      </Row>
      <Row label="Product name">
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
      </Row>
      <Row label="Brand">
        <input
          required
          disabled={mode === "edit"}
          value={form.brandName}
          onChange={(e) => setForm({ ...form, brandName: e.target.value })}
          className="input"
          placeholder="e.g. Heinz"
        />
      </Row>
      <Row label="Category">
        <input
          required
          disabled={mode === "edit"}
          value={form.categoryName}
          onChange={(e) => setForm({ ...form, categoryName: e.target.value })}
          className="input"
          placeholder="e.g. Sauces"
        />
      </Row>
      <Row label="Units per carton">
        <input
          required
          type="number"
          min={1}
          value={form.unitsPerCarton}
          onChange={(e) => setForm({ ...form, unitsPerCarton: Number(e.target.value) })}
          className="input"
        />
      </Row>
      <Row label="Carton price">
        <input
          required
          type="number"
          step="0.01"
          min={0}
          value={form.cartonPrice}
          onChange={(e) => setForm({ ...form, cartonPrice: Number(e.target.value) })}
          className="input"
        />
      </Row>
      <Row label="Stock (cartons)">
        <input
          required
          type="number"
          min={0}
          value={form.stockCartons}
          onChange={(e) => setForm({ ...form, stockCartons: Number(e.target.value) })}
          className="input"
        />
      </Row>
      <Row label="Photo">
        <div>
          {form.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.imageUrl} alt="" className="w-20 h-20 object-cover rounded mb-2 border border-line" />
          )}
          <input type="file" accept="image/*" onChange={handlePhoto} />
          {uploading && <p className="text-xs text-inkSoft mt-1">Uploading…</p>}
        </div>
      </Row>

      {error && <p className="text-brick text-sm">{error}</p>}
      <button disabled={saving} type="submit" className="bg-green text-cream px-5 py-2.5 rounded font-semibold">
        {saving ? "Saving…" : mode === "new" ? "Create product" : "Save changes"}
      </button>

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 8px 12px;
        }
      `}</style>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase text-inkSoft block mb-1">{label}</label>
      {children}
    </div>
  );
}
