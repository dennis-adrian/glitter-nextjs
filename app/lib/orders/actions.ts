"use server";

import { orderItems, orders } from "@/db/schema";
import { NewOrderItem, OrderWithRelations } from "@/app/lib/orders/definitions";
import { db } from "@/db";
import { eq } from "drizzle-orm";

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
				customer: true,
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
