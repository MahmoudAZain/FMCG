import { prisma } from "@/lib/prisma";
import OrderStatusSelect from "@/components/admin/OrderStatusSelect";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({
    include: { user: true, items: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Orders ({orders.length})</h1>
      <div className="bg-creamCard border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[120px_1fr_100px_100px_140px] gap-2 px-4 py-2.5 bg-line/40 text-xs font-bold uppercase text-inkSoft">
          <span>Order</span><span>Buyer</span><span>Cartons</span><span>Total</span><span>Status</span>
        </div>
        {orders.map((o) => (
          <div key={o.id} className="grid grid-cols-[120px_1fr_100px_100px_140px] gap-2 px-4 py-3 border-t border-line items-center text-sm">
            <span className="font-mono text-xs">{o.orderNumber}</span>
            <span>{o.user.companyName}</span>
            <span>{o.items.reduce((s, i) => s + i.cartons, 0)}</span>
            <span className="font-mono">{Number(o.totalAmount).toFixed(2)}</span>
            <OrderStatusSelect id={o.id} status={o.status} />
          </div>
        ))}
        {orders.length === 0 && <p className="p-4 text-sm text-inkSoft">No orders yet.</p>}
      </div>
    </div>
  );
}
