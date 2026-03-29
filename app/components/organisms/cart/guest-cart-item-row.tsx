"use client";

import { CartLineRowLayout } from "@/app/components/organisms/cart/cart-line-row-layout";
import { useCartContext } from "@/app/components/providers/cart-provider";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";
import type { GuestStockValidationResult } from "@/app/lib/cart/actions";
import { GuestCartItem } from "@/app/lib/cart/definitions";
import {
	MAX_CART_LINE_QUANTITY,
	PLACEHOLDER_IMAGE_URLS,
} from "@/app/lib/constants";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";

type GuestCartItemRowProps = {
	item: GuestCartItem;
	stockIssue?: GuestStockValidationResult;
};

export default function GuestCartItemRow({
	item,
	stockIssue,
}: GuestCartItemRowProps) {
	const { removeGuestItem, updateGuestItemQuantity } = useCartContext();

	const stockCap = Math.max(
		1,
		Math.min(
			MAX_CART_LINE_QUANTITY,
			item.product.stock ?? MAX_CART_LINE_QUANTITY,
		),
	);
	const maxQty = Math.max(stockCap, item.quantity);
	const unitPrice = getProductPriceAtPurchase(item.product);
	const subtotal = unitPrice * item.quantity;

	const mainImage = item.product.images.find((img) => img.isMain);
	const imageUrl = mainImage?.imageUrl
		? mainImage.imageUrl
		: PLACEHOLDER_IMAGE_URLS["300"];

	return (
		<CartLineRowLayout
			imageUrl={imageUrl}
			productName={item.product.name}
			unitPrice={unitPrice}
			subtotal={subtotal}
			warnings={
				<>
					{stockIssue?.isOutOfStock && (
						<span className="inline-block text-xs text-destructive font-medium mt-1">
							Sin stock
						</span>
					)}
					{!stockIssue?.isOutOfStock && stockIssue?.quantityExceedsStock && (
						<span className="inline-block text-xs text-amber-600 font-medium mt-1">
							Solo quedan {stockIssue.stock} disponibles
						</span>
					)}
					{!stockIssue && (item.product.stock ?? 0) === 0 && (
						<span className="inline-block text-xs text-destructive font-medium mt-1">
							Sin stock
						</span>
					)}
				</>
			}
			quantityControl={
				<Select
					value={String(item.quantity)}
					onValueChange={(v) =>
						updateGuestItemQuantity(item.productId, Number(v))
					}
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
			}
			onRemove={() => removeGuestItem(item.productId)}
		/>
	);
}
