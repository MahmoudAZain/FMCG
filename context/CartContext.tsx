"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type CartItem = {
  productId: string;
  sku: string;
  name: string;
  cartonPrice: number;
  cartons: number;
  unitsPerCarton: number;
  imageUrl?: string | null;
};

type CartContextType = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "cartons">, cartons: number) => void;
  updateCartons: (productId: string, cartons: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  totalCartons: number;
  subtotal: number;
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cart");
    if (stored) setItems(JSON.parse(stored));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem("cart", JSON.stringify(items));
  }, [items, hydrated]);

  function addItem(item: Omit<CartItem, "cartons">, cartons: number) {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      if (existing) {
        return prev.map((i) => (i.productId === item.productId ? { ...i, cartons: i.cartons + cartons } : i));
      }
      return [...prev, { ...item, cartons }];
    });
  }

  function updateCartons(productId: string, cartons: number) {
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, cartons: Math.max(1, cartons) } : i)));
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function clear() {
    setItems([]);
  }

  const totalCartons = items.reduce((s, i) => s + i.cartons, 0);
  const subtotal = items.reduce((s, i) => s + i.cartons * i.cartonPrice, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateCartons, removeItem, clear, totalCartons, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
