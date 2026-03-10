import { ArrowLeftIcon, BoxIcon, CalendarClockIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import Heading from "@/app/components/atoms/heading";
import MobilePaymentBar from "@/app/components/organisms/orders/mobile-payment-bar";
import OrderPaymentSection from "@/app/components/organisms/orders/order-payment-section";
import { Card, CardContent } from "@/app/components/ui/card";
import { fetchOrder } from "@/app/lib/orders/actions";
import { OrderItemWithRelations } from "@/app/lib/orders/definitions";
import { formatDate } from "@/app/lib/formatters";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({
	profileId: z.coerce.number(),
	orderId: z.coerce.number(),
});

export default async function OrderPayPage(props: {
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

	return (
		<div className="container p-3 pb-28 md:p-6 md:pb-6">
			<div className="mb-4">
				<Link
					href={`/profiles/${profileId}/orders/${orderId}`}
					className="text-sm text-muted-foreground flex items-center gap-1 mb-3 hover:text-foreground transition-colors"
				>
					<ArrowLeftIcon className="h-3.5 w-3.5" />
					Ver detalles del pedido
				</Link>
				<Heading level={2}>Pagar pedido</Heading>
			</div>

			<div className="space-y-4">
				{order.status === "pending" && (
					<div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
						<CalendarClockIcon className="h-4 w-4 shrink-0" />
						<span>
							Fecha límite de pago:{" "}
							<strong>
								{formatDate(order.paymentDueDate).toLocaleString({
									day: "numeric",
									month: "long",
									year: "numeric",
								})}
							</strong>
						</span>
					</div>
				)}

				<OrderPaymentSection
					orderId={order.id}
					totalAmount={order.totalAmount}
					status={order.status}
					paymentVoucherUrl={order.paymentVoucherUrl ?? null}
				/>

				<Card>
					<CardContent className="p-6">
						<p className="text-sm font-medium mb-3 flex items-center gap-2 text-muted-foreground">
							<BoxIcon className="h-3.5 w-3.5" />
							Resumen del pedido
						</p>
						<div className="space-y-2">
							{order.orderItems.map((item: OrderItemWithRelations) => (
								<div key={item.id} className="flex justify-between text-sm">
									<span className="text-muted-foreground">
										{item.product.name}{" "}
										<span className="text-xs">×{item.quantity}</span>
									</span>
									<span className="font-medium">
										Bs {(item.priceAtPurchase * item.quantity).toFixed(2)}
									</span>
								</div>
							))}
							<div className="flex justify-between font-semibold pt-2 border-t">
								<span>Total</span>
								<span>Bs {order.totalAmount.toFixed(2)}</span>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{order.status === "pending" && (
				<MobilePaymentBar orderId={order.id} endpoint="storeOrderPayment" />
			)}
		</div>
	);
}
