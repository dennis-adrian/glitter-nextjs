import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeftIcon, BoxIcon, CalendarClockIcon } from "lucide-react";
import Link from "next/link";

import Heading from "@/app/components/atoms/heading";
import { ClearGuestCartOnPaymentMount } from "@/app/components/organisms/orders/clear-guest-cart-on-payment-mount";
import MobilePaymentBar from "@/app/components/organisms/orders/mobile-payment-bar";
import OrderPaymentSection from "@/app/components/organisms/orders/order-payment-section";
import { Card, CardContent } from "@/app/components/ui/card";
import { fetchOrder, fetchGuestOrder } from "@/app/lib/orders/actions";
import { OrderItemWithRelations } from "@/app/lib/orders/definitions";
import { formatDate } from "@/app/lib/formatters";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import Image from "next/image";

const ParamsSchema = z.object({
	orderId: z.coerce.number(),
});

const SearchParamsSchema = z.object({
	token: z.string().optional(),
});

export default async function OrderPaymentPage(props: {
	params: Promise<{ orderId: string }>;
	searchParams: Promise<{ token?: string }>;
}) {
	const params = await props.params;
	const searchParams = await props.searchParams;

	const parsedParams = ParamsSchema.safeParse(params);
	if (!parsedParams.success) return notFound();

	const parsedSearch = SearchParamsSchema.safeParse(searchParams);
	const token = parsedSearch.success ? parsedSearch.data.token : undefined;

	const { orderId } = parsedParams.data;

	const user = await getCurrentUserProfile();

	let order: Awaited<ReturnType<typeof fetchOrder>>;
	let isGuest = false;

	if (user) {
		order = await fetchOrder(orderId);
		if (!order) return notFound();
		if (order.userId !== user.id && user.role !== "admin") return notFound();
	} else {
		if (!token) return notFound();
		order = await fetchGuestOrder(orderId, token);
		if (!order) return notFound();
		isGuest = true;
	}

	const backHref = isGuest
		? `/orders/${orderId}?token=${token}`
		: `/profiles/${order.userId}/orders/${orderId}`;

	const successRedirectUrl = isGuest
		? `/orders/${orderId}?token=${token}`
		: "/my_orders";

	return (
		<div className="container p-3 pb-28 md:p-6 md:pb-6">
			{isGuest ? <ClearGuestCartOnPaymentMount /> : null}
			<div className="mb-4">
				<Link
					href={backHref}
					className="text-sm text-muted-foreground flex items-center gap-1 mb-3 hover:text-foreground transition-colors"
				>
					<ArrowLeftIcon className="h-3.5 w-3.5" />
					Ver detalles del pedido
				</Link>
				<Heading level={2}>Pagar pedido</Heading>
			</div>

			<div className="space-y-4">
				{order.status === "pending" && order.paymentDueDate && (
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
					guestToken={isGuest ? token : undefined}
					successRedirectUrl={successRedirectUrl}
				/>

				<Card>
					<CardContent className="p-6">
						<p className="text-sm font-medium mb-3 flex items-center gap-2 text-muted-foreground">
							<BoxIcon className="h-3.5 w-3.5" />
							Resumen del pedido
						</p>
						<div className="space-y-3">
							{order.orderItems.map((item: OrderItemWithRelations) => {
								const mainImage = item.product.images.find((img) => img.isMain);
								const imageUrl = mainImage?.imageUrl
									? mainImage.imageUrl
									: PLACEHOLDER_IMAGE_URLS["300"];
								const unitPrice = getProductPriceAtPurchase(item.product);

								return (
									<div key={item.id} className="flex gap-3 items-center">
										<div className="shrink-0 w-10 h-10 rounded overflow-hidden bg-muted">
											<Image
												src={imageUrl}
												alt={item.product.name}
												width={40}
												height={40}
												className="w-full h-full object-cover"
											/>
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium truncate">
												{item.product.name}
											</p>
											<p className="text-xs text-muted-foreground">
												{item.quantity} × Bs {unitPrice.toFixed(2)}
											</p>
										</div>
										<p className="text-sm font-semibold shrink-0">
											Bs {(item.priceAtPurchase * item.quantity).toFixed(2)}
										</p>
									</div>
								);
							})}
							<div className="flex justify-between font-semibold pt-2 border-t">
								<span>Total</span>
								<span>Bs {order.totalAmount.toFixed(2)}</span>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{order.status === "pending" && (
				<MobilePaymentBar
					orderId={order.id}
					guestToken={isGuest ? token : undefined}
					successRedirectUrl={successRedirectUrl}
				/>
			)}
		</div>
	);
}
