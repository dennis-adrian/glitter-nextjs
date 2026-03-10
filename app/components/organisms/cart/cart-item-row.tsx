"use client";

import { CartItemWithProduct } from "@/app/lib/cart/definitions";
import { removeFromCart, updateCartItemQuantity } from "@/app/lib/cart/actions";
import { getCartItemWarnings } from "@/app/lib/cart/utils";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { Button } from "@/app/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";
import { Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { toast } from "sonner";

type CartItemRowProps = {
	item: CartItemWithProduct;
	onCartUpdate: () => Promise<void>;
};

export default function CartItemRow({ item, onCartUpdate }: CartItemRowProps) {
	const [pending, setPending] = useState(false);
	const [localQty, setLocalQty] = useState(item.quantity);
	const updateGenerationRef = useRef(0);
	const previousCommittedQtyRef = useRef(item.quantity);

	useEffect(() => {
		setLocalQty(item.quantity);
		previousCommittedQtyRef.current = item.quantity;
	}, [item.quantity]);

	const warnings = getCartItemWarnings(item);
	const stockCap = Math.max(1, Math.min(5, item.product.stock ?? 5));
	const maxQty = Math.max(stockCap, localQty);
	const unitPrice = getProductPriceAtPurchase(item.product);
	const subtotal = unitPrice * localQty;

	const mainImage = item.product.images.find((img) => img.isMain);
	const imageUrl = mainImage?.imageUrl
		? mainImage.imageUrl
		: PLACEHOLDER_IMAGE_URLS["300"];

	async function handleQuantitySelect(value: string) {
		const newQty = Number(value);
		setLocalQty(newQty);

		const generation = ++updateGenerationRef.current;
		setPending(true);
		try {
			const result = await updateCartItemQuantity(item.productId, newQty);
			if (generation !== updateGenerationRef.current) return;
			if (result.success) {
				previousCommittedQtyRef.current = newQty;
				await onCartUpdate();
			} else {
				toast.error(result.error ?? "No se pudo actualizar la cantidad");
				setLocalQty(previousCommittedQtyRef.current);
			}
		} catch (err) {
			if (generation !== updateGenerationRef.current) return;
			console.error("handleQuantitySelect:", err);
			toast.error("No se pudo actualizar la cantidad");
			setLocalQty(previousCommittedQtyRef.current);
		} finally {
			if (generation === updateGenerationRef.current) setPending(false);
		}
	}

	async function handleRemove() {
		setPending(true);
		try {
			const result = await removeFromCart(item.productId);
			if (result.success) {
				await onCartUpdate();
			} else {
				toast.error(
					result.error ?? "No se pudo eliminar el producto del carrito",
				);
			}
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
				<div className="mt-2">
					{item.product.stock === 0 ? (
						<span className="text-xs text-muted-foreground">
							Cantidad: {localQty}
						</span>
					) : (
						<Select
							value={String(localQty)}
							onValueChange={handleQuantitySelect}
							disabled={pending}
						>
							<SelectTrigger
								className="h-7 w-16 text-sm"
								aria-label={`Cantidad de ${item.product.name}`}
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
									<SelectItem key={n} value={String(n)}>
										{n}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>
			</div>

			{/* Subtotal + remove */}
			<div className="flex flex-col items-end justify-between shrink-0">
				<p className="text-sm font-semibold">Bs {subtotal.toFixed(2)}</p>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-muted-foreground hover:text-destructive"
					aria-label="Eliminar producto del carrito"
					disabled={pending}
					onClick={handleRemove}
				>
					<Trash2Icon className="w-4 h-4" />
				</Button>
			</div>
		</div>
	);
}
