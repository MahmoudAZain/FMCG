"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/products");
      router.refresh();
    }
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-1">Sign in</h1>
      <p className="text-inkSoft text-sm mb-6">Access your wholesale pricing and order history.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase text-inkSoft">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-line rounded px-3 py-2 mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase text-inkSoft">Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-line rounded px-3 py-2 mt-1" />
        </div>
        {error && <p className="text-brick text-sm">{error}</p>}
        <button type="submit" className="w-full bg-green text-cream rounded py-2.5 font-semibold">
          Sign in
        </button>
      </form>
      <p className="text-sm text-inkSoft mt-4">
        No account yet? <Link href="/account/register" className="text-green font-semibold">Register</Link>
      </p>
    </div>
  );
}
