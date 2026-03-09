import { redirect } from "next/navigation";
import Image from "next/image";
import { BoxIcon, TriangleAlertIcon } from "lucide-react";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { fetchCartWithItems } from "@/app/lib/cart/actions";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { Card, CardContent } from "@/app/components/ui/card";
import Heading from "@/app/components/atoms/heading";
import CheckoutConfirmButton from "@/app/components/organisms/checkout/checkout-confirm-button";
import OrderDeliveryInfo from "@/app/components/molecules/order-delivery-info";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";

export default async function CheckoutPage() {
	const user = await getCurrentUserProfile();
	if (!user) redirect("/");

	const cart = await fetchCartWithItems(user.id);
	if (!cart || cart.items.length === 0) redirect("/store");

	const presaleItems = cart.items.filter((i) => i.product.isPreOrder);
	const availableItems = cart.items.filter((i) => !i.product.isPreOrder);
	const total = cart.items.reduce(
		(sum, i) => sum + getProductPriceAtPurchase(i.product) * i.quantity,
		0,
	);

	return (
		<div className="container p-3 pb-28 md:p-6 md:pb-6">
			<div className="mb-4">
				<Heading level={2}>Confirmar pedido</Heading>
				<p className="text-muted-foreground text-sm mt-1">
					Revisá tu pedido antes de confirmarlo.
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 mx-auto">
				{/* Order summary */}
				<Card className="self-start">
					<CardContent className="p-6">
						<Heading level={4} className="mb-4 flex items-center gap-2">
							<BoxIcon className="h-4 w-4" />
							Artículos
						</Heading>
						<div className="divide-y">
							{cart.items.map((item) => {
								const mainImage = item.product.images.find((img) => img.isMain);
								const imageUrl = mainImage?.imageUrl
									? mainImage.imageUrl
									: PLACEHOLDER_IMAGE_URLS["300"];
								const unitPrice = getProductPriceAtPurchase(item.product);

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
												{item.quantity} × Bs {unitPrice.toFixed(2)}
											</p>
											{item.product.isPreOrder && (
												<span className="inline-block text-xs text-amber-600 font-medium mt-0.5">
													Pre-venta
												</span>
											)}
										</div>
										<p className="text-sm font-semibold shrink-0">
											Bs {(unitPrice * item.quantity).toFixed(2)}
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

				<div className="flex flex-col gap-3 md:gap-6">
					{/* Pre-sale notice */}
					{presaleItems.length > 0 && (
						<Card className="border-amber-200 bg-amber-50">
							<CardContent className="p-6 space-y-3">
								<Heading
									level={4}
									className="flex items-center gap-2 text-amber-800"
								>
									<TriangleAlertIcon className="h-4 w-4" />
									Productos en pre-venta
								</Heading>
								<ul className="space-y-1">
									{presaleItems.map((item) => (
										<li key={item.id} className="text-sm text-amber-900">
											<span className="font-medium">{item.product.name}</span>
											{item.product.availableDate && (
												<span className="text-amber-700">
													{" "}
													- disponible desde el{" "}
													{formatDate(
														item.product.availableDate,
													).toLocaleString(DateTime.DATE_FULL)}
												</span>
											)}
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					)}

					{/* Delivery info */}
					<OrderDeliveryInfo
						hasAvailableItems={availableItems.length > 0}
						hasPresaleItems={presaleItems.length > 0}
					/>

				{/* Confirm — desktop only */}
				<div className="hidden md:block">
					<CheckoutConfirmButton />
				</div>
				</div>
			</div>

		{/* Confirm — mobile sticky bar */}
		<div className="fixed bottom-0 left-0 right-0 bg-background border-t px-4 py-4 md:hidden z-40">
			<CheckoutConfirmButton />
		</div>
		</div>
	);
}
