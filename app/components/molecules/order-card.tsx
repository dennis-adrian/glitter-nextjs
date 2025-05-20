import { OrderWithRelations } from "@/app/lib/orders/definitions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import OrderStatusBadge from "../atoms/order-status-badge";
import { Badge } from "../ui/badge";
import { getOrderItemCount, hasPreorders } from "@/app/lib/orders/utils";
import { DateTime } from "luxon";
import { formatDate } from "@/app/lib/formatters";
import OrderItemOverview from "./order-item-overview";

export default function OrderCard({ order }: { order: OrderWithRelations }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-2">
          <div>
            <CardTitle className="text-lg">Pedido #{order.id}</CardTitle>
            <CardDescription>
              Realizado en{" "}
              {formatDate(order.createdAt).toLocaleString(
                DateTime.DATETIME_MED,
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {hasPreorders(order) && (
              <Badge
                variant="outline"
                className="text-amber-600 border-amber-200 bg-amber-50"
              >
                Pre-Venta
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-sm">
              {getOrderItemCount(order)} artículos, Bs
              {order.totalAmount.toFixed(2)}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {order.orderItems.map((item) => (
              <OrderItemOverview key={item.id} item={item} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
