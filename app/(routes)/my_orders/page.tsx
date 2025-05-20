import OrdersList from "@/app/components/organisms/profile-orders/orders-list";
import { fetchOrdersByUserId } from "@/app/lib/orders/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

export default async function MyOrdersPage() {
  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile) {
    notFound();
  }

  const ordersPromise = fetchOrdersByUserId(currentProfile.id);

  return (
    <div className="container p-3 md:p-6">
      <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
        Mis pedidos
      </h1>
      <p>Aquí puedes ver los pedidos que has realizado.</p>
      <div className="mt-4">
        <OrdersList ordersPromise={ordersPromise} />
      </div>
    </div>
  );
}
