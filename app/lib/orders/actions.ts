"use server";

import { orderItems, orders, users } from "@/db/schema";
import {
	NewOrderItem,
	OrderStatus,
	OrderWithRelations,
} from "@/app/lib/orders/definitions";
import { db } from "@/db";
import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { products } from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import { fetchAdminUsers } from "@/app/api/users/actions";
import OrderConfirmationForAdminsEmailTemplate from "@/app/emails/order-confirmation-for-admins";
import OrderConfirmationForUsersEmailTemplate from "@/app/emails/order-confirmation-for-user";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { BaseProduct } from "@/app/lib/products/definitions";

async function sendOrderEmails(emailData: {
	orderId: number;
	customerEmail: string;
	customerName: string;
	products: any[];
	total: number;
}) {
	// 1. Send to user
	const { orderId, customerEmail, customerName, products, total } = emailData;

	await sendEmail({
		to: [customerEmail],
		from: "Glitter Store <reservas@productoraglitter.com>",
		subject: `Tu orden #${orderId} ha sido recibida`,
		react: OrderConfirmationForUsersEmailTemplate({
			customerName,
			orderId: String(orderId),
			products,
			total,
		}) as React.ReactElement,
	});

	// 2. Fetch admins
	const admins = await fetchAdminUsers();
	const adminEmails = admins.map((a) => a.email).filter(Boolean);

	if (adminEmails.length > 0) {
		await sendEmail({
			to: adminEmails,
			from: "Glitter Store <store@productoraglitter.com>",
			replyTo: "soporte@productoraglitter.com",
			subject: `Nueva orden #${orderId} de ${customerName || "Cliente"}`,
			react: OrderConfirmationForAdminsEmailTemplate({
				customerName,
				orderId: String(orderId),
				products,
				total,
			}) as React.ReactElement,
		});
	}
}
export async function createOrder(
	orderItemsIdsQuantityMap: Map<number, number>,
	userId: number,
	customerEmail: string,
	customerName: string,
) {
	let createdOrderId = null;

	try {
		if (orderItemsIdsQuantityMap.size === 0) {
			throw new Error("No order items provided");
		}

		const itemsIds = Array.from(orderItemsIdsQuantityMap.keys());
		let productsInOrder: BaseProduct[] = [];
		let totalAmount = 0;

		createdOrderId = await db.transaction(async (tx) => {
			productsInOrder = await tx
				.select()
				.from(products)
				.where(inArray(products.id, itemsIds))
				.for("update");

			if (productsInOrder.length !== itemsIds.length) {
				const foundIds = new Set(productsInOrder.map((p) => p.id));
				const missingIds = itemsIds.filter((id) => !foundIds.has(id));
				throw new Error(`Products not found: ${missingIds.join(", ")}`);
			}

			// Validate stock availability for non-pre-order products
			const stockValidationErrors: string[] = [];
			for (const product of productsInOrder) {
				const requestedQuantity = orderItemsIdsQuantityMap.get(product.id) || 0;

				const currentStock = product.stock ?? 0;
				if (currentStock < requestedQuantity) {
					stockValidationErrors.push(
						`${product.name} - ${currentStock} disponible(s)`,
					);
				}
			}

			if (stockValidationErrors.length > 0) {
				throw new Error(
					`Stock insuficiente: ${stockValidationErrors.join(", ")}`,
					{
						cause: "stock_insufficient",
					},
				);
			}

			totalAmount = productsInOrder.reduce(
				(acc, product) =>
					acc +
					getProductPriceAtPurchase(product) *
						(orderItemsIdsQuantityMap.get(product.id) || 0),
				0,
			);

			const [order] = await tx
				.insert(orders)
				.values({
					userId,
					totalAmount,
				})
				.returning();

			for (const item of productsInOrder) {
				await tx.insert(orderItems).values({
					productId: item.id,
					quantity: orderItemsIdsQuantityMap.get(item.id) || 0,
					priceAtPurchase: getProductPriceAtPurchase(item),
					orderId: order.id,
				});
			}

			// Decrease product stock
			for (const item of productsInOrder) {
				const orderedQuantity = orderItemsIdsQuantityMap.get(item.id) || 0;

				await tx
					.update(products)
					.set({
						stock: sql`GREATEST(0, COALESCE(${products.stock}, 0) - ${orderedQuantity})`,
					})
					.where(eq(products.id, item.id));
			}

			return order.id;
		});

		const mappedProducts = productsInOrder.map((product) => {
			return {
				id: product.id,
				name: product.name,
				quantity: orderItemsIdsQuantityMap.get(product.id) || 0,
				price: getProductPriceAtPurchase(product),
				isPreOrder: !!product.isPreOrder,
				availableDate: product.availableDate || null,
			};
		});

		try {
			await sendOrderEmails({
				orderId: createdOrderId,
				customerEmail,
				customerName,
				products: mappedProducts,
				total: totalAmount,
			});
		} catch (emailError) {
			console.error("Failed to send order emails", emailError);
		}
	} catch (error) {
		console.error(error);
		if (error instanceof Error && error.cause === "stock_insufficient") {
			return {
				success: false,
				message: error.message,
				details: null,
			};
		}

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
