"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ToggleActiveButton({ id, active }: { id: string; active: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function toggle() {
    setLoading(true);
    await fetch(`/api/admin/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-xs font-semibold px-2 py-1 rounded w-fit ${active ? "bg-greenPale text-greenDark" : "bg-line text-inkSoft"}`}
    >
      {active ? "Active" : "Hidden"}
    </button>
  );
}
