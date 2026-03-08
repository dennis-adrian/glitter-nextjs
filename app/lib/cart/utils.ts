import { CartItemWithProduct } from "@/app/lib/cart/definitions";

export function getCartItemWarnings(item: CartItemWithProduct): {
	isOutOfStock: boolean;
	quantityExceedsStock: boolean;
	availableStock: number;
} {
	const stock = item.product.stock ?? 0;
	return {
		isOutOfStock: stock === 0,
		quantityExceedsStock: item.quantity > stock && stock > 0,
		availableStock: stock,
	};
}
