import { BaseProduct } from "@/app/lib/products/definitions";
import { OrderStatus, OrderWithRelations } from "./definitions";

export function getOrderItemCount(order: OrderWithRelations): number {
	const itemQuantities = order.orderItems.map((item) => item.quantity);
	return itemQuantities.reduce((acc, quantity) => acc + quantity, 0);
}

export function hasPreorders(order: OrderWithRelations): boolean {
	const preOrderItems = order.orderItems.find(
		(item) => item.product.isPreOrder,
	);
	return !!preOrderItems;
}

export function getOrderStatusLabel(status: OrderStatus): string {
	switch (status) {
		case "pending":
			return "Por confirmar";
		case "processing":
			return "En proceso";
		case "delivered":
			return "Entregado";
		case "cancelled":
			return "Cancelado";
		case "paid":
			return "Pagado";
		default:
			return "Desconocido";
	}
}

export function validatedDiscount(
	price: number,
	discount: number,
	discountUnit: BaseProduct["discountUnit"],
): number {
	switch (discountUnit) {
		case "percentage":
			return Math.min(Math.max(discount, 0), 100);
		case "amount":
			return Math.min(Math.max(discount, 0), price);
		default:
			return 0;
	}
}

export function getProductPriceAtPurchase(product: BaseProduct): number {
	if (!product.discount) return product.price;

	const validDiscount = validatedDiscount(
		product.price,
		product.discount,
		product.discountUnit,
	);

	switch (product.discountUnit) {
		case "percentage":
			return product.price * (1 - validDiscount / 100);
		case "amount":
			return product.price - validDiscount;
		default:
			return product.price;
	}
}
