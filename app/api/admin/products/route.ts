import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") return null;
  return session;
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const body = await req.json();
  const { sku, name, brandName, categoryName, unitsPerCarton, cartonPrice, stockCartons, imageUrl } = body;

  if (!sku || !name || !brandName || !categoryName || !unitsPerCarton || cartonPrice == null) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const brand = await prisma.brand.upsert({
    where: { name: brandName },
    update: {},
    create: { name: brandName, slug: slugify(brandName) },
  });
  const category = await prisma.category.upsert({
    where: { name: categoryName },
    update: {},
    create: { name: categoryName, slug: slugify(categoryName) },
  });

  try {
    const product = await prisma.product.create({
      data: {
        sku,
        name,
        brandId: brand.id,
        categoryId: category.id,
        unitsPerCarton: Number(unitsPerCarton),
        cartonPrice: Number(cartonPrice),
        stockCartons: Number(stockCartons) || 0,
        imageUrl: imageUrl || null,
      },
    });
    return NextResponse.json(product);
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: `SKU "${sku}" already exists.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create product." }, { status: 500 });
  }
}

function slugify(s: string) {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
