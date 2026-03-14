import { CalendarClockIcon } from "lucide-react";
import Link from "next/link";

import Heading from "@/app/components/atoms/heading";
import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
} from "@/app/components/ui/card";
import { APP_LOCALE } from "@/app/lib/constants";
import { formatDate } from "@/app/lib/formatters";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { getOrderItemCount, hasPreorders } from "@/app/lib/orders/utils";
import OrderItemOverview from "./order-item-overview";

export default function OrderCard({ order }: { order: OrderWithRelations }) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex flex-col md:flex-row justify-between md:items-center gap-2">
					<div>
						<Heading level={3}>Pedido #{order.id}</Heading>
						<CardDescription>
							Realizado en{" "}
							{new Intl.DateTimeFormat(APP_LOCALE, {
								day: "numeric",
								month: "short",
								year: "numeric",
							}).format(formatDate(order.createdAt).toJSDate())}
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
			{order.status === "pending" && (
				<CardFooter className="pt-0 flex flex-col gap-2">
					{order.paymentDueDate && (
						<p className="text-xs text-amber-700 flex items-center gap-1 w-full">
							<CalendarClockIcon className="h-3 w-3 shrink-0" />
							Vence el{" "}
							{new Intl.DateTimeFormat(APP_LOCALE, {
								day: "numeric",
								month: "short",
								year: "numeric",
							}).format(formatDate(order.paymentDueDate).toJSDate())}
						</p>
					)}
					<Button asChild className="w-full bg-purple-600 hover:bg-purple-700">
						<Link href={`/profiles/${order.userId}/orders/${order.id}/pay`}>
							Pagar pedido
						</Link>
					</Button>
				</CardFooter>
			)}
		</Card>
	);
}
