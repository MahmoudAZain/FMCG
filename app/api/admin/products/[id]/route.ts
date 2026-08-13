import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") return null;
  return session;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const body = await req.json();
  const data: any = {};
  for (const key of ["name", "unitsPerCarton", "cartonPrice", "stockCartons", "imageUrl", "active"]) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  const updated = await prisma.product.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  await prisma.product.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
