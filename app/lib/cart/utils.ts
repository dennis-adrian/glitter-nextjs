import { CartItemWithProduct } from "@/app/lib/cart/definitions";

export function getCartItemWarnings(item: CartItemWithProduct): {
	isOutOfStock: boolean;
	quantityExceedsStock: boolean;
	availableStock: number;
} {
	const stock = item.product.stock;
	// Only treat explicit stock === 0 as out-of-stock; null/undefined = unknown = allow checkout (consistent with cart-item-row)
	return {
		isOutOfStock: stock === 0,
		quantityExceedsStock:
			typeof stock === "number" && stock > 0 && item.quantity > stock,
		availableStock: stock ?? 0,
	};
}
