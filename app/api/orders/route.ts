import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

class InsufficientStock extends Error {}

// Order numbers must be unique. A bare timestamp collides whenever two orders
// land in the same millisecond, so a random suffix is added and the insert is
// retried on the off chance two orders still draw the same number.
function newOrderNumber() {
  const d = new Date();
  const ymd =
    String(d.getUTCFullYear()).slice(2) +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0");
  return `WO-${ymd}-${String(randomInt(0, 100000)).padStart(5, "0")}`;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { items } = await req.json();
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  }

  // Collapse repeated lines for the same product, otherwise each line would be
  // stock-checked on its own and the combined quantity could exceed stock.
  const requested = new Map<string, number>();
  for (const item of items) {
    const productId = typeof item?.productId === "string" ? item.productId : null;
    if (!productId) {
      return NextResponse.json({ error: "Cart contains an invalid item." }, { status: 400 });
    }
    // Quantities are attacker-controlled: a negative or fractional value would
    // otherwise flow into the total and into the stock decrement.
    const cartons = Number(item?.cartons);
    if (!Number.isInteger(cartons) || cartons < 1) {
      return NextResponse.json(
        { error: "Every line must order a whole number of cartons, at least one." },
        { status: 400 }
      );
    }
    requested.set(productId, (requested.get(productId) || 0) + cartons);
  }

  // Re-validate against live product data — never trust client-sent prices.
  const products = await prisma.product.findMany({
    where: { id: { in: Array.from(requested.keys()) } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  let total = 0;
  const orderItemsData: {
    productId: string;
    cartons: number;
    cartonPrice: number;
    productName: string;
    sku: string;
  }[] = [];

  for (const [productId, cartons] of Array.from(requested.entries())) {
    const product = productMap.get(productId);
    if (!product || !product.active) {
      return NextResponse.json({ error: "An item in your cart is no longer available." }, { status: 400 });
    }
    if (cartons > product.stockCartons) {
      return NextResponse.json(
        { error: `Only ${product.stockCartons} cartons of ${product.name} in stock.` },
        { status: 400 }
      );
    }
    const price = Number(product.cartonPrice);
    total += price * cartons;
    orderItemsData.push({
      productId: product.id,
      cartons,
      cartonPrice: price,
      productName: product.name,
      sku: product.sku,
    });
  }

  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            orderNumber: newOrderNumber(),
            userId: (session.user as any).id,
            totalAmount: total,
            items: { create: orderItemsData },
          },
        });
        for (const item of orderItemsData) {
          // Guard the decrement in the UPDATE itself. The check above can go
          // stale between reading stock and writing it, so two orders placed at
          // the same moment could otherwise both pass and oversell the product.
          const { count } = await tx.product.updateMany({
            where: { id: item.productId, stockCartons: { gte: item.cartons } },
            data: { stockCartons: { decrement: item.cartons } },
          });
          if (count === 0) {
            throw new InsufficientStock(`${item.productName} sold out while you were checking out.`);
          }
        }
        return created;
      });

      return NextResponse.json({ id: order.id, orderNumber: order.orderNumber });
    } catch (e: any) {
      if (e instanceof InsufficientStock) {
        return NextResponse.json({ error: e.message }, { status: 409 });
      }
      // Duplicate order number — the whole transaction rolled back, so retrying
      // with a freshly drawn number is safe.
      const isDuplicateOrderNumber =
        e?.code === "P2002" && (e?.meta?.target as string[] | undefined)?.includes("orderNumber");
      if (isDuplicateOrderNumber && attempt < MAX_ATTEMPTS) continue;
      throw e;
    }
  }

  return NextResponse.json(
    { error: "Could not place your order just now. Please try again." },
    { status: 503 }
  );
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { userId: (session.user as any).id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orders);
}
