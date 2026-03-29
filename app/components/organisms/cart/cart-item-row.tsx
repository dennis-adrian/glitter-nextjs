"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CartLineRowLayout } from "@/app/components/organisms/cart/cart-line-row-layout";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";
import { removeFromCart, updateCartItemQuantity } from "@/app/lib/cart/actions";
import { CartItemWithProduct } from "@/app/lib/cart/definitions";
import { getCartItemWarnings } from "@/app/lib/cart/utils";
import {
	MAX_CART_LINE_QUANTITY,
	PLACEHOLDER_IMAGE_URLS,
} from "@/app/lib/constants";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";

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
	const stockCap = Math.max(
		1,
		Math.min(
			MAX_CART_LINE_QUANTITY,
			item.product.stock ?? MAX_CART_LINE_QUANTITY,
		),
	);
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
		<CartLineRowLayout
			imageUrl={imageUrl}
			productName={item.product.name}
			unitPrice={unitPrice}
			subtotal={subtotal}
			warnings={
				<>
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
				</>
			}
			quantityControl={
				item.product.stock === 0 ? (
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
				)
			}
			onRemove={handleRemove}
			removeDisabled={pending}
		/>
	);
}
