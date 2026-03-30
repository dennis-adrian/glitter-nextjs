import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { z } from "zod";
import { BoxIcon, ClockIcon, CreditCardIcon } from "lucide-react";
import { fetchGuestOrder } from "@/app/lib/orders/actions";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { Card, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import Heading from "@/app/components/atoms/heading";
import { Badge } from "@/app/components/ui/badge";

const ParamsSchema = z.object({
	orderId: z.coerce.number(),
});

const SearchParamsSchema = z.object({
	token: z.string().min(1),
});

export default async function GuestOrderPage(props: {
	params: Promise<{ orderId: string }>;
	searchParams: Promise<{ token?: string }>;
}) {
	const params = await props.params;
	const searchParams = await props.searchParams;

	const parsedParams = ParamsSchema.safeParse(params);
	const parsedSearch = SearchParamsSchema.safeParse(searchParams);

	if (!parsedParams.success || !parsedSearch.success) {
		return notFound();
	}

	const order = await fetchGuestOrder(
		parsedParams.data.orderId,
		parsedSearch.data.token,
	);

	if (!order) {
		return notFound();
	}

	const total = order.orderItems.reduce(
		(sum, item) => sum + item.priceAtPurchase * item.quantity,
		0,
	);

	const statusLabel = getOrderStatusLabel(order.status);

	return (
		<div className="container px-3 py-6 max-w-2xl mx-auto">
			<div className="mb-6">
				<Heading level={2}>Tu orden #{order.id}</Heading>
				<div className="flex items-center gap-2 mt-2">
					<Badge variant="outline">{statusLabel}</Badge>
					{order.guestName && (
						<span className="text-sm text-muted-foreground">
							{order.guestName}
						</span>
					)}
				</div>
			</div>

			<div className="space-y-4">
				{/* Order items */}
				<Card>
					<CardContent className="p-6">
						<Heading level={4} className="mb-4 flex items-center gap-2">
							<BoxIcon className="h-4 w-4" />
							Artículos
						</Heading>
						<div className="divide-y">
							{order.orderItems.map((item) => {
								const mainImage = item.product.images.find((img) => img.isMain);
								const imageUrl = mainImage?.imageUrl
									? mainImage.imageUrl
									: PLACEHOLDER_IMAGE_URLS["300"];

								return (
									<div key={item.id} className="flex gap-3 py-3">
										<div className="shrink-0 w-14 h-14 rounded-md overflow-hidden bg-muted">
											<Image
												src={imageUrl}
												alt={item.product.name}
												width={56}
												height={56}
												className="w-full h-full object-cover"
											/>
										</div>
										<div className="flex-1 min-w-0">
											<p className="font-medium text-sm truncate">
												{item.product.name}
											</p>
											<p className="text-xs text-muted-foreground">
												{item.quantity} × Bs {item.priceAtPurchase.toFixed(2)}
											</p>
											{item.product.isPreOrder && (
												<span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium mt-0.5">
													<ClockIcon className="w-3 h-3" />
													Pre-venta
												</span>
											)}
										</div>
										<p className="text-sm font-semibold shrink-0">
											Bs {(item.priceAtPurchase * item.quantity).toFixed(2)}
										</p>
									</div>
								);
							})}
						</div>
						<div className="flex justify-between font-semibold text-base pt-4 border-t mt-2">
							<span>Total</span>
							<span>Bs {total.toFixed(2)}</span>
						</div>
					</CardContent>
				</Card>

				{/* Payment CTA */}
				{order.status === "pending" && (
					<Card className="border-blue-200 bg-blue-50">
						<CardContent className="p-6 space-y-3">
							<Heading level={4} className="text-blue-800">
								Tu pedido está pendiente de pago
							</Heading>
							<p className="text-sm text-blue-900">
								Podés pagar ahora con tu banco mediante código QR y subir el
								comprobante para que confirmemos tu pedido.
							</p>
							<Button asChild className="bg-primary hover:bg-primary/90">
								<Link
									href={`/orders/${order.id}/payment?token=${parsedSearch.data.token}`}
								>
									<CreditCardIcon className="h-4 w-4 mr-2" />
									Pagar pedido
								</Link>
							</Button>
						</CardContent>
					</Card>
				)}

				{order.status === "payment_verification" && (
					<Card className="border-amber-200 bg-amber-50">
						<CardContent className="p-6">
							<Heading level={4} className="text-amber-800">
								Verificando tu pago
							</Heading>
							<p className="text-sm text-amber-900 mt-2">
								Recibimos tu comprobante y lo estamos revisando. Te
								notificaremos al correo <strong>{order.guestEmail}</strong>{" "}
								cuando confirmemos el pago.
							</p>
						</CardContent>
					</Card>
				)}

				{order.status === "paid" && (
					<Card className="border-green-200 bg-green-50">
						<CardContent className="p-6">
							<Heading level={4} className="text-green-800">
								¡Pago confirmado!
							</Heading>
							<p className="text-sm text-green-900 mt-2">
								Tu pago fue verificado. Coordinaremos la entrega contigo.
							</p>
						</CardContent>
					</Card>
				)}

				{order.status === "delivered" && (
					<Card className="border-green-200 bg-green-50">
						<CardContent className="p-6">
							<Heading level={4} className="text-green-800">
								¡Entregado!
							</Heading>
							<p className="text-sm text-green-900 mt-2">
								Tu orden fue entregada. ¡Gracias por tu compra!
							</p>
						</CardContent>
					</Card>
				)}

				{order.status === "cancelled" && (
					<Card className="border-destructive/30 bg-destructive/5">
						<CardContent className="p-6">
							<Heading level={4} className="text-destructive">
								Orden cancelada
							</Heading>
							<p className="text-sm text-muted-foreground mt-2">
								Esta orden fue cancelada. Si tenés preguntas, contactanos.
							</p>
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
