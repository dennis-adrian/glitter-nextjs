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
