"use server";

import { cookies } from "next/headers";
import { orderItems, orders } from "@/db/schema";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import {
	ORDER_TAB_VALUES,
	type OrderTabValue,
} from "@/app/lib/orders/order-tabs";
import { db } from "@/db";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { products } from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import { fetchAdminUsers } from "@/app/api/users/actions";
import OrderConfirmationForAdminsEmailTemplate from "@/app/emails/order-confirmation-for-admins";
import OrderConfirmationForUsersEmailTemplate from "@/app/emails/order-confirmation-for-user";
import OrderPaymentConfirmationForUserEmailTemplate from "@/app/emails/order-payment-confirmation-for-user";
import OrderVoucherSubmittedForAdminsEmailTemplate from "@/app/emails/order-voucher-submitted-for-admins";
import OrderUpdatedForUserEmailTemplate from "@/app/emails/order-updated-for-user";
import OrderUpdatedForAdminsEmailTemplate from "@/app/emails/order-updated-for-admins";
import { getPostHogClient } from "@/app/lib/posthog-server";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

function revalidateStoreOrderViews() {
	revalidatePath("/dashboard/store");
	revalidatePath("/dashboard/store/orders");
	revalidatePath("/dashboard/store/payments");
	revalidatePath("/dashboard/store/analytics");
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
			paymentDueDate: sql`now() + interval '2 days'`,
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

export type CreateGuestOrderInTxResult = CreateOrderInTxResult & {
	guestOrderToken: string;
};

export async function createGuestOrderInTx(
	tx: OrderTx,
	orderItemsIdsQuantityMap: Map<number, number>,
	guestName: string,
	guestEmail: string,
	guestPhone: string,
): Promise<CreateGuestOrderInTxResult> {
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

	// Generate a cryptographically random token for guest order tracking
	const { randomBytes } = await import("crypto");
	const guestOrderToken = randomBytes(32).toString("hex");

	const [order] = await tx
		.insert(orders)
		.values({
			userId: null,
			guestName,
			guestEmail,
			guestPhone,
			guestOrderToken,
			totalAmount,
			paymentDueDate: sql`now() + interval '2 days'`,
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
		guestOrderToken,
	};
}

export async function sendGuestOrderEmails(emailData: {
	orderId: number;
	guestOrderToken: string;
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
	const {
		orderId,
		guestOrderToken,
		customerEmail,
		customerName,
		products,
		total,
	} = emailData;
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
	const trackingUrl = `${baseUrl}/orders/${orderId}?token=${guestOrderToken}`;

	await sendEmail({
		to: [customerEmail],
		from: "Glitter Store <reservas@productoraglitter.com>",
		subject: `Tu orden #${orderId} ha sido recibida`,
		react: OrderConfirmationForUsersEmailTemplate({
			customerName,
			orderId: String(orderId),
			products,
			total,
			trackingUrl,
		}) as React.ReactElement,
	});

	const admins = await fetchAdminUsers();
	const adminEmails = admins.map((a) => a.email).filter(Boolean);

	if (adminEmails.length > 0) {
		await sendEmail({
			to: adminEmails,
			from: "Glitter Store <store@productoraglitter.com>",
			replyTo: "soporte@productoraglitter.com",
			subject: `Nueva orden #${orderId} de ${customerName || "Cliente"} (invitado)`,
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

/** Fetches a guest order by id + token. Returns null if not found or token mismatch. */
export async function fetchGuestOrder(
	orderId: number,
	token: string,
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
			where: and(eq(orders.id, orderId), eq(orders.guestOrderToken, token)),
		});

		return order ?? null;
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

// ─── Order count aggregate ────────────────────────────────────────────────────

const ORDER_TAB_DEFAULT: Record<OrderTabValue, number> =
	ORDER_TAB_VALUES.reduce(
		(acc, value) => {
			acc[value] = 0;
			return acc;
		},
		{} as Record<OrderTabValue, number>,
	);

export async function fetchOrderCountsByUserId(
	userId: number,
): Promise<Record<OrderTabValue, number>> {
	try {
		const rows = await db
			.select({ status: orders.status, count: count() })
			.from(orders)
			.where(eq(orders.userId, userId))
			.groupBy(orders.status);

		const result = { ...ORDER_TAB_DEFAULT };
		for (const row of rows) {
			if (row.status in result) {
				result[row.status as OrderTabValue] = Number(row.count);
			}
		}
		return result;
	} catch (error) {
		console.error(error);
		return { ...ORDER_TAB_DEFAULT };
	}
}

export async function fetchOrdersByUserIdAndStatus(
	userId: number,
	status: OrderStatus,
) {
	try {
		return await db.query.orders.findMany({
			where: and(eq(orders.userId, userId), eq(orders.status, status)),
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

export async function fetchOrdersByStatus(
	status?: OrderStatus | readonly OrderStatus[],
) {
	try {
		const statusWhere =
			status === undefined
				? undefined
				: typeof status === "string"
					? eq(orders.status, status)
					: inArray(orders.status, status);

		return await db.query.orders.findMany({
			where: statusWhere,
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

export async function fetchPendingVoucherCount(): Promise<number> {
	try {
		const result = await db
			.select({ count: count() })
			.from(orders)
			.where(eq(orders.status, "payment_verification"));
		return result[0]?.count ?? 0;
	} catch (error) {
		console.error(error);
		return 0;
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
	const orderBefore = await fetchOrder(orderId);

	try {
		await db.update(orders).set({ status }).where(eq(orders.id, orderId));
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "No se pudo actualizar el pedido.",
		};
	}

	if (status === "paid" && orderBefore && orderBefore.status !== "paid") {
		const recipientEmail =
			orderBefore.customer?.email ?? orderBefore.guestEmail;
		const recipientName =
			orderBefore.customer?.displayName ??
			orderBefore.customer?.firstName ??
			orderBefore.guestName ??
			"";
		try {
			if (recipientEmail) {
				await sendEmail({
					to: [recipientEmail],
					from: "Glitter Store <reservas@productoraglitter.com>",
					subject: `Tu pago de la orden #${orderId} fue confirmado`,
					react: OrderPaymentConfirmationForUserEmailTemplate({
						customerName: recipientName,
						orderId: String(orderId),
						total: orderBefore.totalAmount,
					}) as React.ReactElement,
				});
			}
		} catch (emailError) {
			console.error("Failed to send payment confirmation email", emailError);
		}
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

		if (order.userId) {
			revalidatePath(`/profiles/${order.userId}/orders/${orderId}`);
		}
		revalidateStoreOrderViews();

		try {
			const admins = await fetchAdminUsers();
			const adminEmails = admins.map((a) => a.email).filter(Boolean);
			if (adminEmails.length > 0) {
				await sendEmail({
					to: adminEmails,
					from: "Glitter Store <store@productoraglitter.com>",
					subject: `Nuevo comprobante de pago — orden #${orderId}`,
					react: OrderVoucherSubmittedForAdminsEmailTemplate({
						customerName:
							currentUser.displayName ?? currentUser.firstName ?? "Cliente",
						orderId: String(orderId),
					}) as React.ReactElement,
				});
			}
		} catch (adminEmailError) {
			console.error("[submitOrderVoucher] Admin notification email failed", {
				orderId,
				error: adminEmailError,
			});
		}

		try {
			const posthog = getPostHogClient();
			posthog.capture({
				distinctId: currentUser.clerkId,
				event: POSTHOG_EVENTS.ORDER_PAYMENT_VOUCHER_UPLOADED,
				properties: { order_id: orderId },
			});
			await posthog.shutdown();
		} catch (posthogError) {
			console.error("[submitOrderPaymentVoucher] PostHog capture failed", {
				orderId,
				error: posthogError,
			});
		}

		return { success: true, message: "Comprobante enviado correctamente." };
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo enviar el comprobante." };
	}
}

export async function submitGuestOrderPaymentVoucher(
	orderId: number,
	token: string,
	voucherUrl: string,
) {
	if (!isAllowedVoucherUrl(voucherUrl)) {
		return { success: false, message: "Invalid voucher URL source" };
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
					eq(orders.guestOrderToken, token),
					isNull(orders.userId),
					eq(orders.status, "pending"),
				),
			)
			.returning();

		if (!order) {
			return {
				success: false,
				message: "Orden no encontrada o el token no es válido.",
			};
		}

		revalidatePath(`/orders/${orderId}`);
		revalidateStoreOrderViews();

		try {
			const admins = await fetchAdminUsers();
			const adminEmails = admins.map((a) => a.email).filter(Boolean);
			if (adminEmails.length > 0) {
				await sendEmail({
					to: adminEmails,
					from: "Glitter Store <store@productoraglitter.com>",
					subject: `Nuevo comprobante de pago — orden #${orderId}`,
					react: OrderVoucherSubmittedForAdminsEmailTemplate({
						customerName: order.guestName ?? "Invitado",
						orderId: String(orderId),
					}) as React.ReactElement,
				});
			}
		} catch (adminEmailError) {
			console.error(
				"[submitGuestOrderPaymentVoucher] Admin notification email failed",
				{ orderId, error: adminEmailError },
			);
		}

		try {
			const posthog = getPostHogClient();
			posthog.capture({
				distinctId: `guest_${token}`,
				event: POSTHOG_EVENTS.ORDER_PAYMENT_VOUCHER_UPLOADED,
				properties: { order_id: orderId, is_guest: true },
			});
			await posthog.shutdown();
		} catch (posthogError) {
			console.error("[submitGuestOrderPaymentVoucher] PostHog capture failed", {
				orderId,
				error: posthogError,
			});
		}

		return { success: true, message: "Comprobante enviado correctamente." };
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo enviar el comprobante." };
	}
}

export async function adminAttachOrderVoucher(
	orderId: number,
	voucherUrl: string,
) {
	const currentUser = await getCurrentUserProfile();
	if (!currentUser || currentUser.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción.",
		};
	}

	if (!isAllowedVoucherUrl(voucherUrl)) {
		return { success: false, message: "URL de comprobante inválida." };
	}

	try {
		const [order] = await db
			.update(orders)
			.set({
				paymentVoucherUrl: voucherUrl,
				voucherSubmittedAt: new Date(),
				status: "payment_verification",
			})
			.where(
				and(
					eq(orders.id, orderId),
					inArray(orders.status, ["pending", "payment_verification"]),
				),
			)
			.returning();

		if (!order) {
			return { success: false, message: "Orden no encontrada o ya procesada." };
		}
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo guardar el comprobante." };
	}

	revalidateStoreOrderViews();
	return { success: true, message: "Comprobante guardado correctamente." };
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
				totalRevenue: sql<number>`cast(coalesce(sum(${orders.totalAmount}) filter (where ${orders.status} in ('paid', 'delivered')), 0) as numeric(10,2))`,
				needsAttention: sql<number>`cast(count(*) filter (where ${orders.status} in ('pending', 'payment_verification')) as integer)`,
				inProgress: sql<number>`cast(count(*) filter (where ${orders.status} = 'processing') as integer)`,
				delivered: sql<number>`cast(count(*) filter (where ${orders.status} = 'delivered') as integer)`,
				cancelled: sql<number>`cast(count(*) filter (where ${orders.status} = 'cancelled') as integer)`,
			})
			.from(orders);

		return {
			totalOrders: result.totalOrders ?? 0,
			totalRevenue: Number(result.totalRevenue ?? 0),
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

export type UpdateOrderItemInput = {
	orderItemId: number;
	quantity: number; // 0 = remove
};

export type UpdateOrderResult = {
	success: boolean;
	message: string;
	wasCancelled?: boolean;
	cause?: "conflict" | "stock_insufficient" | "not_found" | "forbidden";
};

type OrderChange = {
	productName: string;
	oldQuantity: number;
	newQuantity: number;
};

async function sendOrderUpdatedEmails(data: {
	orderId: number;
	customerEmail: string;
	customerName: string;
	changes: OrderChange[];
	newTotal: number;
}) {
	const { orderId, customerEmail, customerName, changes, newTotal } = data;

	await sendEmail({
		to: [customerEmail],
		from: "Glitter Store <reservas@productoraglitter.com>",
		subject: `Tu orden #${orderId} fue modificada`,
		react: OrderUpdatedForUserEmailTemplate({
			customerName,
			orderId: String(orderId),
			changes,
			newTotal,
		}) as React.ReactElement,
	});

	const admins = await fetchAdminUsers();
	const adminEmails = admins.map((a) => a.email).filter(Boolean);

	if (adminEmails.length > 0) {
		await sendEmail({
			to: adminEmails,
			from: "Glitter Store <store@productoraglitter.com>",
			replyTo: "soporte@productoraglitter.com",
			subject: `Orden #${orderId} modificada por ${customerName || "Cliente"}`,
			react: OrderUpdatedForAdminsEmailTemplate({
				customerName,
				orderId: String(orderId),
				changes,
				newTotal,
			}) as React.ReactElement,
		});
	}
}

export async function updateOrder(
	orderId: number,
	profileId: number,
	items: UpdateOrderItemInput[],
	clientUpdatedAt: string,
): Promise<UpdateOrderResult> {
	// 1. Auth
	const currentUser = await getCurrentUserProfile();
	if (!currentUser) {
		return {
			success: false,
			message: "Debes iniciar sesión para editar un pedido.",
			cause: "forbidden",
		};
	}

	// 2. Fetch order
	const order = await fetchOrder(orderId);
	if (!order) {
		return {
			success: false,
			message: "Orden no encontrada.",
			cause: "not_found",
		};
	}

	// 3. Ownership + status guards (guest orders have no userId and cannot be edited here)
	if (order.userId !== currentUser.id && currentUser.role !== "admin") {
		return {
			success: false,
			message: "No tienes permiso para editar este pedido.",
			cause: "forbidden",
		};
	}

	if (order.status !== "pending") {
		return {
			success: false,
			message: "Solo puedes editar pedidos pendientes.",
		};
	}

	// 4. Optimistic concurrency check
	if (order.updatedAt.toISOString() !== clientUpdatedAt) {
		return {
			success: false,
			cause: "conflict",
			message:
				"El pedido fue modificado en otra sesión. Por favor recargá la página.",
		};
	}

	// 5. Build edit map and validate all item IDs belong to this order
	const editMap = new Map<number, number>(
		items.map((i) => [i.orderItemId, i.quantity]),
	);
	const orderItemIds = new Set(order.orderItems.map((i) => i.id));
	for (const itemId of editMap.keys()) {
		if (!orderItemIds.has(itemId)) {
			return {
				success: false,
				message: "Artículo no pertenece a este pedido.",
				cause: "forbidden",
			};
		}
	}

	// 6. Price-lock guard (server-side mirror of UI restriction)
	for (const orderItem of order.orderItems) {
		const newQty = editMap.get(orderItem.id);
		// Skip items that weren't submitted (unchanged) or aren't being changed
		if (newQty === undefined || newQty === orderItem.quantity) continue;
		const currentPrice = getProductPriceAtPurchase(orderItem.product);
		if (Math.abs(currentPrice - orderItem.priceAtPurchase) > 0.001) {
			return {
				success: false,
				message: `No puedes modificar "${orderItem.product.name}" porque su precio cambió desde que realizaste el pedido.`,
			};
		}
	}

	// 7. Determine if this is a full cancellation
	const willCancelOrder = items.every((i) => i.quantity === 0);

	// 8. DB Transaction
	try {
		await db.transaction(async (tx) => {
			// Re-fetch order row with lock to prevent races
			const [freshOrder] = await tx
				.select()
				.from(orders)
				.where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
				.for("update");

			if (!freshOrder) {
				throw Object.assign(
					new Error("Orden no encontrada o ya no está pendiente."),
					{ cause: "not_found" },
				);
			}
			if (freshOrder.updatedAt.toISOString() !== clientUpdatedAt) {
				throw Object.assign(
					new Error(
						"El pedido fue modificado en otra sesión. Por favor recargá la página.",
					),
					{ cause: "conflict" },
				);
			}

			if (willCancelOrder) {
				// Restore all stock and cancel
				for (const item of order.orderItems) {
					await tx
						.update(products)
						.set({
							stock: sql`COALESCE(${products.stock}, 0) + ${item.quantity}`,
						})
						.where(eq(products.id, item.productId));
				}
				await tx
					.update(orders)
					.set({ status: "cancelled", updatedAt: sql`now()` })
					.where(eq(orders.id, orderId));
			} else {
				// Restore old quantities to stock for all edited items
				for (const [itemId] of editMap) {
					const orderItem = order.orderItems.find((i) => i.id === itemId)!;
					await tx
						.update(products)
						.set({
							stock: sql`COALESCE(${products.stock}, 0) + ${orderItem.quantity}`,
						})
						.where(eq(products.id, orderItem.productId));
				}

				// Re-fetch affected products FOR UPDATE and validate stock
				const affectedProductIds = Array.from(editMap.entries())
					.filter(([, qty]) => qty > 0)
					.map(
						([itemId]) =>
							order.orderItems.find((i) => i.id === itemId)!.productId,
					);

				const freshProducts =
					affectedProductIds.length > 0
						? await tx
								.select()
								.from(products)
								.where(inArray(products.id, affectedProductIds))
								.for("update")
						: [];

				const stockErrors: string[] = [];
				for (const [itemId, newQty] of editMap) {
					if (newQty <= 0) continue;
					const orderItem = order.orderItems.find((i) => i.id === itemId)!;
					const freshProduct = freshProducts.find(
						(p) => p.id === orderItem.productId,
					);
					if (freshProduct && (freshProduct.stock ?? 0) < newQty) {
						stockErrors.push(
							`${freshProduct.name} - ${freshProduct.stock ?? 0} disponible(s)`,
						);
					}
				}

				if (stockErrors.length > 0) {
					throw Object.assign(
						new Error(`Stock insuficiente: ${stockErrors.join(", ")}`),
						{ cause: "stock_insufficient" },
					);
				}

				// Apply changes: delete removed items, update quantities, deduct new stock
				for (const [itemId, newQty] of editMap) {
					if (newQty === 0) {
						await tx.delete(orderItems).where(eq(orderItems.id, itemId));
					} else {
						await tx
							.update(orderItems)
							.set({ quantity: newQty, updatedAt: sql`now()` })
							.where(eq(orderItems.id, itemId));

						const orderItem = order.orderItems.find((i) => i.id === itemId)!;
						await tx
							.update(products)
							.set({
								stock: sql`GREATEST(0, COALESCE(${products.stock}, 0) - ${newQty})`,
							})
							.where(eq(products.id, orderItem.productId));
					}
				}

				// Recalculate total using priceAtPurchase
				const newTotal = order.orderItems.reduce((acc, item) => {
					const newQty = editMap.get(item.id);
					if (newQty === 0) return acc; // removed
					const qty = newQty !== undefined ? newQty : item.quantity; // changed or unchanged
					return acc + item.priceAtPurchase * qty;
				}, 0);

				await tx
					.update(orders)
					.set({ totalAmount: newTotal, updatedAt: sql`now()` })
					.where(eq(orders.id, orderId));
			}
		});
	} catch (error) {
		console.error(error);
		if (error instanceof Error) {
			if (error.cause === "conflict") {
				return { success: false, cause: "conflict", message: error.message };
			}
			if (error.cause === "stock_insufficient") {
				return {
					success: false,
					cause: "stock_insufficient",
					message: error.message,
				};
			}
			if (error.cause === "not_found") {
				return { success: false, cause: "not_found", message: error.message };
			}
		}
		return { success: false, message: "No se pudo actualizar el pedido." };
	}

	// 9. Revalidate
	revalidatePath(`/profiles/${profileId}/orders/${orderId}`);
	revalidatePath(`/profiles/${profileId}/orders/${orderId}/edit`);
	revalidatePath("/my_orders");
	revalidateStoreOrderViews();

	// 10. Build change summary and send emails (outside transaction, non-fatal)
	const changes: OrderChange[] = order.orderItems
		.filter((item) => editMap.has(item.id))
		.map((item) => ({
			productName: item.product.name,
			oldQuantity: item.quantity,
			newQuantity: editMap.get(item.id)!,
		}));

	const newTotal = willCancelOrder
		? 0
		: order.orderItems.reduce((acc, item) => {
				const newQty = editMap.get(item.id);
				if (newQty === 0) return acc;
				const qty = newQty !== undefined ? newQty : item.quantity;
				return acc + item.priceAtPurchase * qty;
			}, 0);

	try {
		await sendOrderUpdatedEmails({
			orderId,
			customerEmail: order.customer?.email ?? order.guestEmail ?? "",
			customerName:
				order.customer?.displayName ??
				order.customer?.firstName ??
				order.guestName ??
				"Cliente",
			changes,
			newTotal,
		});
	} catch (emailError) {
		console.error("Failed to send order updated emails", emailError);
	}

	return {
		success: true,
		wasCancelled: willCancelOrder,
		message: willCancelOrder
			? "Tu pedido fue cancelado."
			: "Tu pedido fue actualizado correctamente.",
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

export async function storeGuestOrderToken(
	orderId: number,
	token: string,
): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.set(`guest_order_${orderId}`, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: `/orders/${orderId}`,
		maxAge: 60 * 60 * 24 * 30,
	});
}
