"use client";

import { RedirectButton } from "../../redirect-button";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import OrderCard from "../../molecules/order-card";
import { use } from "react";

type OrdersListProps = {
  ordersPromise: Promise<OrderWithRelations[]>;
};

export default function OrdersList({ ordersPromise }: OrdersListProps) {
  const orders = use(ordersPromise);

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium mb-2">Sin Pedidos</h3>
        <p className="text-muted-foreground mb-6">
          No tienes ningún pedido en este momento
        </p>
        <RedirectButton href="/store">Ir a la tiendita Glitter</RedirectButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}
