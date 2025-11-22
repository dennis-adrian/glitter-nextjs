"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import StoreProductImages from "@/app/components/molecules/store-product-images";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import { validatedDiscount } from "@/app/lib/orders/utils";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { ProductStatusBadge } from "@/components/molecules/ProductStatusBadge";
import { ClockIcon } from "lucide-react";
import { useState } from "react";
import StoreItemQuantityInput from "./store-item-quantity-input";

type StoreItemCardProps = {
	product: BaseProductWithImages;
	user?: BaseProfile;
};

export default function StoreItemCard({ product, user }: StoreItemCardProps) {
	const [isHovered, setIsHovered] = useState(false);

	let originalPrice = null;
	let price = product.price;
	if (product.discount && product.discountUnit === "percentage") {
		const validDiscount = validatedDiscount(
			product.price,
			product.discount,
			product.discountUnit,
		);
		originalPrice = product.price;
		price = product.price * (1 - validDiscount / 100);
	} else if (product.discount && product.discountUnit === "amount") {
		const validDiscount = validatedDiscount(
			product.price,
			product.discount,
			product.discountUnit,
		);
		originalPrice = product.price;
		price = product.price - validDiscount;
	}

	return (
		<Card
			className="group relative bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
				<ProductStatusBadge
					status={product.status}
					discount={product.discount}
					discountUnit={product.discountUnit}
					stock={product.stock ?? 0}
				/>
			</div>

			<StoreProductImages
				productName={product.name}
				stock={product.stock ?? 0}
				images={product.images}
				isHovered={isHovered}
			/>

			<CardContent className="p-5">
				<h3 className="font-semibold text-lg mb-1 text-balance">
					{product.name}
				</h3>
				<p className="text-sm text-muted-foreground mb-4 text-pretty leading-relaxed">
					{product.description}
				</p>
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-baseline gap-2">
						<span className="text-2xl font-semibold">Bs{price.toFixed(2)}</span>
						{originalPrice && (
							<span className="text-sm text-muted-foreground line-through">
								Bs{originalPrice.toFixed(2)}
							</span>
						)}
					</div>
				</div>
				{product.isPreOrder && product.availableDate && (
					<p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
						<ClockIcon className="w-3 h-3" />
						Disponible el {formatDate(product.availableDate).toLocaleString()}
					</p>
				)}
				<StoreItemQuantityInput product={product} user={user} />
			</CardContent>
		</Card>
	);
}
