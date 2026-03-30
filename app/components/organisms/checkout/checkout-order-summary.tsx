"use client";

import Image from "next/image";
import { BoxIcon } from "lucide-react";

import Heading from "@/app/components/atoms/heading";
import { Card, CardContent } from "@/app/components/ui/card";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";

import type { CheckoutLineItem } from "./checkout-line-item";

type CheckoutOrderSummaryProps = {
	items: CheckoutLineItem[];
	total: number;
};

export function CheckoutOrderSummary({ items, total }: CheckoutOrderSummaryProps) {
	return (
		<Card className="self-start">
			<CardContent className="p-6">
				<Heading level={4} className="mb-4 flex items-center gap-2">
					<BoxIcon className="h-4 w-4" />
					Artículos
				</Heading>
				<div className="divide-y">
					{items.map((item) => {
						const images = item.product.images;
						const mainImage =
							images.find((img) => img.isMain) ?? images[0];
						const imageUrl =
							images.length === 0
								? PLACEHOLDER_IMAGE_URLS["300"]
								: mainImage!.imageUrl;
						const unitPrice = getProductPriceAtPurchase(item.product);

						return (
							<div key={item.key} className="flex gap-3 py-3">
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
	);
}
