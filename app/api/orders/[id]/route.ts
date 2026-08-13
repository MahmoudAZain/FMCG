import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { items: true },
  });
  if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isOwner = order.userId === (session.user as any).id;
  const isAdmin = (session.user as any).role === "ADMIN";
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  return NextResponse.json(order);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const { status } = await req.json();
  const order = await prisma.order.update({ where: { id: params.id }, data: { status } });
  return NextResponse.json(order);
}
