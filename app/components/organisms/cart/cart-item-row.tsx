"use client";

import { CartItemWithProduct } from "@/app/lib/cart/definitions";
import { removeFromCart, updateCartItemQuantity } from "@/app/lib/cart/actions";
import { getCartItemWarnings } from "@/app/lib/cart/utils";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { Button } from "@/app/components/ui/button";
import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { toast } from "sonner";

type CartItemRowProps = {
	item: CartItemWithProduct;
	userId: number;
	onCartUpdate: () => Promise<void>;
};

export default function CartItemRow({
	item,
	userId,
	onCartUpdate,
}: CartItemRowProps) {
	const [pending, setPending] = useState(false);
	const [localQty, setLocalQty] = useState(item.quantity);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		setLocalQty(item.quantity);
	}, [item.quantity]);

	useEffect(() => {
		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
				debounceRef.current = null;
			}
		};
	}, []);

	const warnings = getCartItemWarnings(item);
	const unitPrice = getProductPriceAtPurchase(item.product);
	const subtotal = unitPrice * localQty;

	const mainImage = item.product.images.find((img) => img.isMain);
	const imageUrl = mainImage?.imageUrl
		? mainImage.imageUrl
		: PLACEHOLDER_IMAGE_URLS["300"];

	function handleQuantityChange(delta: number) {
		const newQty = localQty + delta;
		if (newQty < 0) return;
		setLocalQty(newQty);

		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(async () => {
			setPending(true);
			try {
				await updateCartItemQuantity(userId, item.productId, newQty);
				await onCartUpdate();
			} catch (err) {
				console.error("handleQuantityChange:", err);
			} finally {
				setPending(false);
			}
		}, 600);
	}

	async function handleRemove() {
		setPending(true);
		try {
			await removeFromCart(userId, item.productId);
			await onCartUpdate();
		} catch (err) {
			console.error("handleRemove:", err);
			toast.error("No se pudo eliminar el producto del carrito");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="flex gap-3 py-4 border-b last:border-b-0">
			{/* Product image */}
			<div className="shrink-0 w-16 h-16 rounded-md overflow-hidden bg-muted">
				<Image
					src={imageUrl}
					alt={item.product.name}
					width={64}
					height={64}
					className="w-full h-full object-cover"
				/>
			</div>

			{/* Details */}
			<div className="flex-1 min-w-0">
				<p className="font-medium text-sm truncate">{item.product.name}</p>
				<p className="text-sm text-muted-foreground">
					Bs {unitPrice.toFixed(2)}
				</p>

				{/* Stock warnings */}
				{warnings.isOutOfStock && (
					<span className="inline-block text-xs text-destructive font-medium mt-1">
						Sin stock
					</span>
				)}
				{warnings.quantityExceedsStock && (
					<span className="inline-block text-xs text-amber-600 font-medium mt-1">
						Solo quedan {warnings.availableStock}
					</span>
				)}

				{/* Quantity controls */}
				<div className="flex items-center gap-2 mt-2">
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7"
						disabled={pending || localQty <= 0}
						onClick={() => handleQuantityChange(-1)}
					>
						<MinusIcon className="w-3 h-3" />
					</Button>
					<span className="text-sm w-5 text-center">{localQty}</span>
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7"
						disabled={
							pending ||
							localQty >=
								(item.product.stock == null
									? 5
									: Math.min(5, item.product.stock))
						}
						onClick={() => handleQuantityChange(1)}
					>
						<PlusIcon className="w-3 h-3" />
					</Button>
				</div>
			</div>

			{/* Subtotal + remove */}
			<div className="flex flex-col items-end justify-between shrink-0">
				<p className="text-sm font-semibold">Bs {subtotal.toFixed(2)}</p>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-muted-foreground hover:text-destructive"
					disabled={pending}
					onClick={handleRemove}
				>
					<Trash2Icon className="w-4 h-4" />
				</Button>
			</div>
		</div>
	);
}
