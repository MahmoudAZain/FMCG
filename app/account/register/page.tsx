"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [form, setForm] = useState({ companyName: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    // Auto sign-in after instant registration
    await signIn("credentials", { email: form.email, password: form.password, redirect: false });
    router.push("/products");
    router.refresh();
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-1">Create a wholesale account</h1>
      <p className="text-inkSoft text-sm mb-6">Instant approval — start ordering right away.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Company name" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} required />
        <Field label="Work email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="Password (8+ characters)" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
        {error && <p className="text-brick text-sm">{error}</p>}
        <button disabled={loading} type="submit" className="w-full bg-amber text-ink rounded py-2.5 font-semibold">
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase text-inkSoft">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-line rounded px-3 py-2 mt-1"
      />
    </div>
  );
}
