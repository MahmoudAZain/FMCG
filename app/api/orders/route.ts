import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { items } = await req.json();
  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  }

  // Re-validate against live product data — never trust client-sent prices.
  const productIds = items.map((i: any) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productMap = new Map(products.map((p) => [p.id, p]));

  let total = 0;
  const orderItemsData: {
    productId: string;
    cartons: number;
    cartonPrice: number;
    productName: string;
    sku: string;
  }[] = [];
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product || !product.active) {
      return NextResponse.json({ error: `${item.name} is no longer available.` }, { status: 400 });
    }
    if (item.cartons > product.stockCartons) {
      return NextResponse.json({ error: `Only ${product.stockCartons} cartons of ${product.name} in stock.` }, { status: 400 });
    }
    const price = Number(product.cartonPrice);
    total += price * item.cartons;
    orderItemsData.push({
      productId: product.id,
      cartons: item.cartons,
      cartonPrice: price,
      productName: product.name,
      sku: product.sku,
    });
  }

  const orderNumber = `WO-${Date.now().toString().slice(-8)}`;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        userId: (session.user as any).id,
        totalAmount: total,
        items: { create: orderItemsData },
      },
    });
    for (const item of orderItemsData) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockCartons: { decrement: item.cartons } },
      });
    }
    return created;
  });

  return NextResponse.json({ id: order.id, orderNumber: order.orderNumber });
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
