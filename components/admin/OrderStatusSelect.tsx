"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

export default function OrderStatusSelect({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  const router = useRouter();

  async function handleChange(newStatus: string) {
    setValue(newStatus);
    await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
  }

  return (
    <select value={value} onChange={(e) => handleChange(e.target.value)} className="border border-line rounded px-2 py-1 text-xs">
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.charAt(0) + s.slice(1).toLowerCase()}
        </option>
      ))}
    </select>
  );
}
