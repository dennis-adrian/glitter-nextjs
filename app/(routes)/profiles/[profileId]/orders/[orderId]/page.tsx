import { BoxIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import Heading from "@/app/components/atoms/heading";
import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import OrderDeliveryInfo from "@/app/components/molecules/order-delivery-info";
import { fetchOrder } from "@/app/lib/orders/actions";
import { OrderItemWithRelations } from "@/app/lib/orders/definitions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({
	profileId: z.coerce.number(),
	orderId: z.coerce.number(),
});

export default async function UserOrderPage(props: {
	params: Promise<z.infer<typeof ParamsSchema>>;
}) {
	const params = await props.params;
	const validatedParams = ParamsSchema.safeParse(params);

	if (!validatedParams.success) {
		return notFound();
	}

	const currentUser = await getCurrentUserProfile();
	await protectRoute(currentUser || undefined, validatedParams.data.profileId);

	const order = await fetchOrder(validatedParams.data.orderId);

	if (!order) {
		return notFound();
	}

	const { profileId, orderId } = validatedParams.data;
	const canPay = order.status === "pending";
	const hasAvailableItems = order.orderItems.some(
		(item: OrderItemWithRelations) => !item.product.isPreOrder,
	);
	const hasPresaleItems = order.orderItems.some(
		(item: OrderItemWithRelations) => item.product.isPreOrder,
	);

	return (
		<div className={`container p-3 md:p-6${canPay ? " pb-32 lg:pb-0" : ""}`}>
			<div className="mb-4">
				<Heading>Detalles del Pedido</Heading>
				<p className="text-gray-500">
					Orden #{order.id} • Pedido realizado el{" "}
					{formatDate(order.createdAt).toLocaleString({
						month: "long",
						day: "numeric",
						year: "numeric",
					})}
				</p>
			</div>
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-6">
				<div className="lg:col-span-2 space-y-6">
					{/* Order Items */}
					<div className="bg-white rounded-xl shadow-xs border p-6">
						<h2 className="text-lg font-semibold mb-4 flex items-center">
							<BoxIcon className="h-5 w-5 mr-2" />
							Artículos
						</h2>

						<div className="divide-y">
							{order.orderItems.map((item: OrderItemWithRelations) => (
								<div key={item.id} className="py-4 flex gap-4">
									<div className="h-20 w-20 rounded-md overflow-hidden bg-gray-100 shrink-0">
										<Image
											src={
												item.product.images[0]?.imageUrl || "/placeholder.svg"
											}
											alt={item.product.name}
											width={80}
											height={80}
											className="object-cover w-full h-full"
										/>
									</div>
									<div className="flex-1">
										<div className="flex justify-between">
											<h3 className="font-medium">{item.product.name}</h3>
											<p className="font-medium">
												Bs{(item.priceAtPurchase * item.quantity).toFixed(2)}
											</p>
										</div>
										<div className="flex justify-between mt-1">
											<p className="text-sm text-gray-500">
												Cantidad: {item.quantity}
											</p>
											<p className="text-sm text-gray-500">
												Bs{item.priceAtPurchase.toFixed(2)} cada uno
											</p>
										</div>
									</div>
								</div>
							))}
						</div>

						<div className="flex justify-between font-medium text-lg pt-4 border-t mt-2">
							<span>Total</span>
							<span>Bs{order.totalAmount.toFixed(2)}</span>
						</div>
					</div>
				</div>

				<div className="flex flex-col gap-3 md:gap-6">
					{/* Status + Pay + Edit */}
					<Card>
						<CardContent className="p-6 space-y-4">
							<div>
								<p className="text-sm text-muted-foreground mb-2">Estado</p>
								<OrderStatusBadge status={order.status} />
							</div>
							{canPay && (
								<div className="hidden lg:flex flex-col gap-2">
									<Button
										asChild
										className="w-full bg-purple-600 hover:bg-purple-700"
									>
										<Link href={`/orders/${orderId}/payment`}>
											Pagar pedido
										</Link>
									</Button>
									<Button asChild variant="outline" className="w-full">
										<Link
											href={`/profiles/${profileId}/orders/${orderId}/edit`}
										>
											Editar pedido
										</Link>
									</Button>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Delivery info */}
					<OrderDeliveryInfo
						hasAvailableItems={hasAvailableItems}
						hasPresaleItems={hasPresaleItems}
					/>
				</div>
			</div>
			{/* Mobile sticky action bar */}
			{canPay && (
				<div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-4 py-3 z-10">
					<div className="flex flex-col gap-2">
						<Button
							asChild
							className="w-full bg-purple-600 hover:bg-purple-700"
						>
							<Link href={`/orders/${orderId}/payment`}>
								Pagar pedido
							</Link>
						</Button>
						<Button asChild variant="outline" className="w-full">
							<Link href={`/profiles/${profileId}/orders/${orderId}/edit`}>
								Editar pedido
							</Link>
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
