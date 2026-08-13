import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { placed?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/account/login");

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { items: true },
  });
  if (!order) notFound();

  const isOwner = order.userId === (session.user as any).id;
  const isAdmin = (session.user as any).role === "ADMIN";
  if (!isOwner && !isAdmin) redirect("/products");

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      {searchParams.placed && (
        <div className="bg-greenPale border border-green rounded-lg p-4 mb-6 text-sm text-greenDark font-medium">
          Order {order.orderNumber} submitted — we'll confirm dispatch within one business day.
        </div>
      )}
      <h1 className="text-2xl font-bold mb-1">Order {order.orderNumber}</h1>
      <p className="text-inkSoft text-sm mb-6 capitalize">Status: {order.status.toLowerCase()}</p>
      <div className="bg-creamCard border border-line rounded-lg p-5">
        {order.items.map((i) => (
          <div key={i.id} className="flex justify-between text-sm py-1.5">
            <span>{i.cartons} × {i.productName}</span>
            <span className="font-mono">{(i.cartons * Number(i.cartonPrice)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
        <div className="border-t border-line mt-3 pt-3 flex justify-between font-bold">
          <span>Total</span>
          <span>{Number(order.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  );
}
