"use server";

import { orderItems, orders } from "@/db/schema";
import {
	NewOrderItem,
	OrderStatus,
	OrderWithRelations,
} from "@/app/lib/orders/definitions";
import { db } from "@/db";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { products } from "@/db/schema";

export async function createOrder(
	orderItemsToInsert: NewOrderItem[],
	userId: number,
	totalAmount: number,
) {
	let createdOrderId = null;
	try {
		if (orderItemsToInsert.length === 0) {
			throw new Error("No order items provided");
		}

		const orderId = await db.transaction(async (tx) => {
			const [order] = await tx
				.insert(orders)
				.values({
					userId,
					totalAmount,
				})
				.returning();

			orderItemsToInsert.forEach(async (item) => {
				await tx.insert(orderItems).values({
					...item,
					orderId: order.id,
				});
			});

			return order.id;
		});

		createdOrderId = orderId;
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "No se pudo crear la orden.",
			details: null,
		};
	}

	return {
		success: true,
		message: "Orden creada correctamente.",
		details: {
			orderId: createdOrderId,
		},
	};
}

export async function fetchOrder(
	orderId: number,
): Promise<OrderWithRelations | null> {
	try {
		const order = await db.query.orders.findFirst({
			with: {
				customer: {
					with: {
						profileSubcategories: {
							with: {
								subcategory: true,
							},
						},
					},
				},
				orderItems: {
					with: {
						product: true,
					},
				},
			},
			where: eq(orders.id, orderId),
		});

		if (!order) {
			return null;
		}

		return order;
	} catch (error) {
		console.error(error);
		return null;
	}
}

export async function fetchOrdersByUserId(userId: number) {
	try {
		return await db.query.orders.findMany({
			where: eq(orders.userId, userId),
			with: {
				customer: {
					with: {
						profileSubcategories: {
							with: {
								subcategory: true,
							},
						},
					},
				},
				orderItems: {
					with: {
						product: true,
					},
				},
			},
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}

export async function fetchOrders() {
	try {
		return await db.query.orders.findMany({
			with: {
				customer: {
					with: {
						profileSubcategories: {
							with: {
								subcategory: true,
							},
						},
					},
				},
				orderItems: {
					with: {
						product: true,
					},
				},
			},
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}

export async function acceptOrder(orderId: number) {
	try {
		await db
			.update(orders)
			.set({ status: "processing" })
			.where(eq(orders.id, orderId));
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "No se pudo aceptar la orden.",
		};
	}

	revalidatePath("/dashboard/orders");
	return {
		success: true,
		message: "Orden aceptada correctamente.",
	};
}

export async function deleteOrder(orderId: number) {
	try {
		await db.delete(orders).where(eq(orders.id, orderId));
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "No se pudo eliminar la orden.",
		};
	}

	revalidatePath("/dashboard/orders");
	return {
		success: true,
		message: "Orden eliminada correctamente.",
	};
}

export async function updateOrderStatus(orderId: number, status: OrderStatus) {
	try {
		await db.update(orders).set({ status }).where(eq(orders.id, orderId));
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "No se pudo actualizar el pedido.",
		};
	}

	revalidatePath("/dashboard/orders");
	return {
		success: true,
		message: "Pedido actualizado correctamente.",
	};
}

export async function fetchOrdersTotalsByProduct() {
	try {
		const result = await db.transaction(async (tx) => {
			const totals = await tx
				.select({
					productId: orderItems.productId,
					productName: products.name,
					status: orders.status,
					totalQuantity: sql<number>`cast(sum(${orderItems.quantity}) as integer)`,
				})
				.from(orderItems)
				.innerJoin(orders, eq(orderItems.orderId, orders.id))
				.innerJoin(products, eq(orderItems.productId, products.id))
				.groupBy(orderItems.productId, products.name, orders.status);

			return totals;
		});

		return result;
	} catch (error) {
		console.error(error);
		return [];
	}
}