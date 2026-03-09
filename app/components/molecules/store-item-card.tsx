"use client";

import StoreProductImages from "@/app/components/molecules/store-product-images";
import { Card, CardContent } from "@/app/components/ui/card";
import { useCart } from "@/app/components/providers/cart-provider";
import { formatDate } from "@/app/lib/formatters";
import { addToCart } from "@/app/lib/cart/actions";
import { validatedDiscount } from "@/app/lib/orders/utils";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { ProductStatusBadge } from "@/components/molecules/ProductStatusBadge";
import { ClockIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";

type StoreItemCardProps = {
	product: BaseProductWithImages;
};

export default function StoreItemCard({ product }: StoreItemCardProps) {
	const [isAdding, setIsAdding] = useState(false);
	const { setItemCount } = useCart();

	const inStock = (product.stock ?? 0) > 0;

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

	async function handleQuickAdd(e: React.MouseEvent<HTMLButtonElement>) {
		e.preventDefault();
		e.stopPropagation();

		setIsAdding(true);
		try {
			const { success, newCount } = await addToCart(product.id, 1);
			if (success) {
				setItemCount(newCount);
				toast.success("Producto agregado al carrito");
			} else {
				toast.error("No se pudo agregar al carrito");
			}
		} finally {
			setIsAdding(false);
		}
	}

	return (
		<Link href={`/store/products/${product.id}`} className="block">
			<Card className="group relative bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow h-full">
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
					interactive={false}
					autoPlay={true}
				/>

				<CardContent className="p-3 flex flex-col gap-2">
					<p className="font-medium text-sm leading-tight line-clamp-2">
						{product.name}
					</p>

					<div className="flex items-baseline gap-1.5">
						<span className="font-semibold text-base">
							Bs{price.toFixed(2)}
						</span>
						{originalPrice && (
							<span className="text-xs text-muted-foreground line-through">
								Bs{originalPrice.toFixed(2)}
							</span>
						)}
					</div>

					{product.isPreOrder && product.availableDate && (
						<p className="text-xs text-muted-foreground flex items-center gap-1">
							<ClockIcon className="w-3 h-3" />
							{formatDate(product.availableDate).toLocaleString({
								month: "short",
								day: "numeric",
							})}
						</p>
					)}

					<Button
						size="sm"
						className={
							inStock
								? product.isPreOrder
									? "w-full bg-amber-600 hover:bg-amber-700 mt-1"
									: "w-full bg-purple-600 hover:bg-purple-700 mt-1"
								: "w-full bg-muted text-muted-foreground hover:bg-muted mt-1"
						}
						disabled={!inStock || isAdding}
						onClick={handleQuickAdd}
					>
						{!inStock ? (
							<span className="text-xs md:text-sm">Agotado</span>
						) : (
							<span className="text-xs md:text-sm">Agregar al carrito</span>
						)}
					</Button>
				</CardContent>
			</Card>
		</Link>
	);
}
