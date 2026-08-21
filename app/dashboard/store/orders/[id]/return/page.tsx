import { notFound, redirect } from "next/navigation";

import AdminReturnOrderForm from "@/app/components/organisms/orders/admin-return-order-form";
import { fetchOrder } from "@/app/lib/orders/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function AdminOrderReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard/store/orders");
  const { id } = await params;
  const order = await fetchOrder(Number(id));
  if (!order || !["paid", "delivered"].includes(order.status)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          Registrar devolución · pedido #{order.id}
        </h1>
        <p className="text-sm text-muted-foreground">
          Disponible para pedidos pagados o entregados. Solo administradores
          pueden registrar devoluciones.
        </p>
      </div>
      <AdminReturnOrderForm order={order} />
    </div>
  );
}
