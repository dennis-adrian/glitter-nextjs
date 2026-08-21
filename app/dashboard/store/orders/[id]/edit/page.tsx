import { notFound, redirect } from "next/navigation";

import AdminAdjustOrderForm from "@/app/components/organisms/orders/admin-adjust-order-form";
import {
  fetchAdminOrderAdjustmentProducts,
  fetchOrder,
} from "@/app/lib/orders/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function AdminOrderEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard/store/orders");
  const { id } = await params;
  const [order, products] = await Promise.all([
    fetchOrder(Number(id)),
    fetchAdminOrderAdjustmentProducts(),
  ]);
  if (
    !order ||
    !["pending", "payment_verification", "processing"].includes(order.status)
  )
    notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Modificar pedido #{order.id}</h1>
        <p className="text-sm text-muted-foreground">
          Los cambios quedan registrados en la actividad del pedido.
        </p>
      </div>
      <AdminAdjustOrderForm order={order} products={products} />
    </div>
  );
}
