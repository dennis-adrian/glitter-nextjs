import { CardContent } from "@/app/components/ui/card";
import { Card } from "@/app/components/ui/card";
import { fetchOrder } from "@/app/lib/orders/actions";
import { OrderItemWithRelations } from "@/app/lib/orders/definitions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { BoxIcon, CreditCardIcon, TruckIcon } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";

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

	return (
		<div className="container p-3 md:p-6">
			<div className="bg-white rounded-xl shadow-xs border p-6 mb-8">
				<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
					<div>
						<h1 className="text-2xl font-bold">Detalles del Pedido</h1>
						<p className="text-gray-500">
							Orden #{order.id} • Pedido realizado el{" "}
							{order.orderDate?.toLocaleDateString()}
						</p>
					</div>
				</div>
			</div>
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
				<div className="lg:col-span-2 space-y-8">
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

						<div className="mt-4 space-y-2">
							{/* <div className="flex justify-between text-sm">
								<span className="text-gray-500">Subtotal</span>
								<span>
									$
									{order.orderItems
										.reduce(
											(acc: number, item: any) =>
												acc + item.product.price * item.quantity,
											0,
										)
										.toFixed(2)}
								</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-500">Shipping</span>
								<span>$0.00</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-500">Tax</span>
								<span>$10.40</span>
							</div> */}
							<div className="flex justify-between font-medium text-lg pt-2 border-t mt-2">
								<span>Total</span>
								<span>Bs{order.totalAmount.toFixed(2)}</span>
							</div>
						</div>
					</div>
				</div>

				<div className="space-y-8">
					{/* Shipping Information */}
					<Card>
						<CardContent className="p-6">
							<h2 className="text-lg font-semibold mb-4 flex items-center">
								<TruckIcon className="h-5 w-5 mr-2" />
								Información de Entrega
							</h2>
							<p className="text-sm text-muted-foreground">
								La entrega del pedido se realizará durante la entrega de
								credenciales o en el próximo festival.
							</p>
						</CardContent>
					</Card>

					{/* Payment Information */}
					<Card>
						<CardContent className="p-6">
							<h2 className="text-lg font-semibold mb-4 flex items-center">
								<CreditCardIcon className="h-5 w-5 mr-2" />
								Información de Pago
							</h2>
							<div className="space-y-1">
								{/* <p className="text-sm">
									<span className="text-gray-500">Payment Method:</span>
								</p> */}
								{/* <p>{order.payment.method}</p> */}
								<p className="text-sm text-muted-foreground">
									Nos comunicaremos por WhatsApp para coordinar el pago del
									pedido.
								</p>
							</div>
							{/* <div className="mt-4 pt-4 border-t">
								<div className="flex justify-between font-medium">
									<span>Total Paid</span>
									<span>${order.payment.total.toFixed(2)}</span>
								</div>
							</div> */}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
