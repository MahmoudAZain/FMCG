"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BulkImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/products/import", { method: "POST", body: formData });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Import failed.");
      return;
    }
    setResult(data);
    router.refresh();
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-2">Bulk Import</h1>
      <p className="text-sm text-inkSoft mb-4">
        Upload an Excel (.xlsx) or CSV file to update prices, stock, and add new products in one go.
        Matching is by <strong>SKU</strong> — existing SKUs get updated, new ones get created.
      </p>

      <div className="bg-creamCard border border-line rounded-lg p-4 mb-6 text-xs">
        <p className="font-semibold uppercase text-inkSoft mb-2">Required columns</p>
        <code className="block bg-cream p-2 rounded font-mono text-[11px] leading-relaxed">
          sku, name, brand, category, unitsPerCarton, cartonPrice, stockCartons, imageUrl (optional)
        </code>
      </div>

      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="mb-4 block"
      />
      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className="bg-amber text-ink px-5 py-2.5 rounded font-semibold"
      >
        {loading ? "Importing…" : "Upload and import"}
      </button>

      {error && <p className="text-brick text-sm mt-4">{error}</p>}

      {result && (
        <div className="mt-6 bg-creamCard border border-line rounded-lg p-4 text-sm">
          <p className="font-semibold mb-1">
            {result.created} created · {result.updated} updated · {result.totalRows} rows processed
          </p>
          {result.errors.length > 0 && (
            <ul className="text-brick text-xs mt-2 list-disc pl-4 space-y-0.5">
              {result.errors.map((e: string, i: number) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
