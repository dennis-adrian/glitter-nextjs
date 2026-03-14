"use server";

import { orderItems, orders } from "@/db/schema";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import { db } from "@/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { products } from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import { fetchAdminUsers } from "@/app/api/users/actions";
import OrderConfirmationForAdminsEmailTemplate from "@/app/emails/order-confirmation-for-admins";
import OrderConfirmationForUsersEmailTemplate from "@/app/emails/order-confirmation-for-user";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

function revalidateStoreOrderViews() {
	revalidatePath("/dashboard/store");
	revalidatePath("/dashboard/store/orders");
	revalidatePath("/dashboard/store/payments");
}

export async function sendOrderEmails(emailData: {
	orderId: number;
	customerEmail: string;
	customerName: string;
	products: {
		id: number;
		name: string;
		quantity: number;
		price: number;
		isPreOrder: boolean;
		availableDate: Date | null;
	}[];
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

export type CreateOrderInTxResult = {
	orderId: number;
	mappedProducts: {
		id: number;
		name: string;
		quantity: number;
		price: number;
		isPreOrder: boolean;
		availableDate: Date | null;
	}[];
	totalAmount: number;
};

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createOrderInTx(
	tx: OrderTx,
	orderItemsIdsQuantityMap: Map<number, number>,
	userId: number,
	_customerEmail: string,
	_customerName: string,
): Promise<CreateOrderInTxResult> {
	if (orderItemsIdsQuantityMap.size === 0) {
		throw new Error("No order items provided");
	}

	for (const [itemId, qty] of orderItemsIdsQuantityMap.entries()) {
		if (qty <= 0) {
			throw new Error(`Invalid quantity for itemId ${itemId}`);
		}
	}

	const itemsIds = Array.from(orderItemsIdsQuantityMap.keys());
	const productsInOrder = await tx
		.select()
		.from(products)
		.where(inArray(products.id, itemsIds))
		.for("update");

	if (productsInOrder.length !== itemsIds.length) {
		const foundIds = new Set(productsInOrder.map((p) => p.id));
		const missingIds = itemsIds.filter((id) => !foundIds.has(id));
		throw new Error(`Products not found: ${missingIds.join(", ")}`);
	}

	const stockValidationErrors: string[] = [];
	for (const product of productsInOrder) {
		const requestedQuantity = orderItemsIdsQuantityMap.get(product.id)!;
		const currentStock = product.stock ?? 0;
		if (currentStock < requestedQuantity) {
			stockValidationErrors.push(
				`${product.name} - ${currentStock} disponible(s)`,
			);
		}
	}

	if (stockValidationErrors.length > 0) {
		throw new Error(`Stock insuficiente: ${stockValidationErrors.join(", ")}`, {
			cause: "stock_insufficient",
		});
	}

	const totalAmount = productsInOrder.reduce(
		(acc, product) =>
			acc +
			getProductPriceAtPurchase(product) *
				orderItemsIdsQuantityMap.get(product.id)!,
		0,
	);

	const [order] = await tx
		.insert(orders)
		.values({
			userId,
			totalAmount,
			paymentDueDate: sql`now() + interval '10 days'`,
		})
		.returning();

	for (const item of productsInOrder) {
		await tx.insert(orderItems).values({
			productId: item.id,
			quantity: orderItemsIdsQuantityMap.get(item.id)!,
			priceAtPurchase: getProductPriceAtPurchase(item),
			orderId: order.id,
		});
	}

	// Decrease product stock
	for (const item of productsInOrder) {
		const orderedQuantity = orderItemsIdsQuantityMap.get(item.id)!;
		await tx
			.update(products)
			.set({
				stock: sql`GREATEST(0, COALESCE(${products.stock}, 0) - ${orderedQuantity})`,
			})
			.where(eq(products.id, item.id));
	}

	const mappedProducts = productsInOrder.map((product) => ({
		id: product.id,
		name: product.name,
		quantity: orderItemsIdsQuantityMap.get(product.id)!,
		price: getProductPriceAtPurchase(product),
		isPreOrder: !!product.isPreOrder,
		availableDate: product.availableDate || null,
	}));

	return {
		orderId: order.id,
		mappedProducts,
		totalAmount,
	};
}

export async function createOrder(
	orderItemsIdsQuantityMap: Map<number, number>,
	userId: number,
	customerEmail: string,
	customerName: string,
) {
	let result: CreateOrderInTxResult | null = null;

	try {
		result = await db.transaction((tx) =>
			createOrderInTx(
				tx,
				orderItemsIdsQuantityMap,
				userId,
				customerEmail,
				customerName,
			),
		);

		try {
			await sendOrderEmails({
				orderId: result.orderId,
				customerEmail,
				customerName,
				products: result.mappedProducts,
				total: result.totalAmount,
			});
		} catch (emailError) {
			console.error("Failed to send order emails", emailError);
		}

		return {
			success: true,
			message: "Orden creada correctamente.",
			details: { orderId: result.orderId },
		};
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
						product: {
							with: {
								images: true,
							},
						},
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
			orderBy: [desc(orders.createdAt)],
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
						product: {
							with: {
								images: true,
							},
						},
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
						product: {
							with: {
								images: true,
							},
						},
					},
				},
			},
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}

export async function fetchPendingVoucherReviewOrders() {
	try {
		return await db.query.orders.findMany({
			where: eq(orders.status, "payment_verification"),
			orderBy: [desc(orders.voucherSubmittedAt)],
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
						product: {
							with: {
								images: true,
							},
						},
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
			.set({ status: "paid" })
			.where(eq(orders.id, orderId));
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "No se pudo aceptar la orden.",
		};
	}

	revalidateStoreOrderViews();
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

	revalidateStoreOrderViews();
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

	revalidateStoreOrderViews();
	return {
		success: true,
		message: "Pedido actualizado correctamente.",
	};
}

function isAllowedVoucherUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString);
		if (url.protocol !== "http:" && url.protocol !== "https:") return false;
		const hostname = url.hostname.toLowerCase();
		return (
			hostname === "utfs.io" ||
			hostname === "ufs.sh" ||
			hostname.endsWith(".ufs.sh")
		);
	} catch {
		console.error("URL de comprobante de pago inválida", urlString);
		return false;
	}
}

export async function submitOrderPaymentVoucher(
	orderId: number,
	voucherUrl: string,
) {
	const currentUser = await getCurrentUserProfile();
	if (!currentUser) {
		return {
			success: false,
			message: "Debes iniciar sesión para enviar el comprobante.",
		};
	}

	if (!isAllowedVoucherUrl(voucherUrl)) {
		return {
			success: false,
			message: "Invalid voucher URL source",
		};
	}

	try {
		const [order] = await db
			.update(orders)
			.set({
				paymentVoucherUrl: voucherUrl,
				status: "payment_verification",
				voucherSubmittedAt: new Date(),
			})
			.where(
				and(
					eq(orders.id, orderId),
					eq(orders.userId, currentUser.id),
					eq(orders.status, "pending"),
				),
			)
			.returning();

		if (!order) {
			return {
				success: false,
				message: "Orden no encontrada o no tienes permiso para actualizarla.",
			};
		}

		revalidatePath(`/profiles/${order.userId}/orders/${orderId}`);
		revalidateStoreOrderViews();

		return { success: true, message: "Comprobante enviado correctamente." };
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo enviar el comprobante." };
	}
}

export type OrdersStats = {
	totalOrders: number;
	totalRevenue: number;
	needsAttention: number;
	inProgress: number;
	delivered: number;
	cancelled: number;
};

export async function fetchOrdersStats(): Promise<OrdersStats> {
	try {
		const [result] = await db
			.select({
				totalOrders: sql<number>`cast(count(*) as integer)`,
				totalRevenue: sql<number>`cast(coalesce(sum(${orders.totalAmount}) filter (where ${orders.status} in ('paid', 'delivered')), 0) as real)`,
				needsAttention: sql<number>`cast(count(*) filter (where ${orders.status} in ('pending', 'payment_verification')) as integer)`,
				inProgress: sql<number>`cast(count(*) filter (where ${orders.status} = 'processing') as integer)`,
				delivered: sql<number>`cast(count(*) filter (where ${orders.status} = 'delivered') as integer)`,
				cancelled: sql<number>`cast(count(*) filter (where ${orders.status} = 'cancelled') as integer)`,
			})
			.from(orders);

		return {
			totalOrders: result.totalOrders ?? 0,
			totalRevenue: result.totalRevenue ?? 0,
			needsAttention: result.needsAttention ?? 0,
			inProgress: result.inProgress ?? 0,
			delivered: result.delivered ?? 0,
			cancelled: result.cancelled ?? 0,
		};
	} catch (error) {
		console.error(error);
		return {
			totalOrders: 0,
			totalRevenue: 0,
			needsAttention: 0,
			inProgress: 0,
			delivered: 0,
			cancelled: 0,
		};
	}
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
