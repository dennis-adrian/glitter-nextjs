"use server";

import OrderCancellationTemplate from "@/app/emails/order-cancellation";
import OrderPaymentReminderTemplate from "@/app/emails/order-payment-reminder";
import OrderPaymentWarningTemplate from "@/app/emails/order-payment-warning";
import { queueEmails } from "@/app/lib/emails/helpers";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import { orders, products, orderItems } from "@/db/schema";
import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";

type OrderCustomer = {
	email: string;
	displayName: string | null;
	firstName: string | null;
	lastName: string | null;
};

type OrderWithUser = {
	id: number;
	paymentDueDate: Date;
	customer: OrderCustomer;
};

function getCustomerName(customer: OrderCustomer): string {
	return (
		customer.displayName ||
		`${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
		"Cliente"
	);
}

export async function handleOrderPaymentReminders(): Promise<{
	reminder1: number;
	reminder2: number;
	reminder3: number;
}> {
	const counts = { reminder1: 0, reminder2: 0, reminder3: 0 };

	let pendingReminder1: OrderWithUser[] = [];
	let pendingReminder2: OrderWithUser[] = [];
	let pendingReminder3: OrderWithUser[] = [];

	try {
		await db.transaction(async (tx) => {
			pendingReminder1 = (await tx.query.orders.findMany({
				where: and(
					eq(orders.status, "pending"),
					isNull(orders.paymentReminder1SentAt),
					lte(orders.paymentDueDate, sql`now() + interval '8 days'`),
					gt(orders.paymentDueDate, sql`now()`),
				),
				with: { customer: true },
			})) as OrderWithUser[];

			pendingReminder2 = (await tx.query.orders.findMany({
				where: and(
					eq(orders.status, "pending"),
					isNull(orders.paymentReminder2SentAt),
					lte(orders.paymentDueDate, sql`now() + interval '5 days'`),
					gt(orders.paymentDueDate, sql`now()`),
				),
				with: { customer: true },
			})) as OrderWithUser[];

			pendingReminder3 = (await tx.query.orders.findMany({
				where: and(
					eq(orders.status, "pending"),
					isNull(orders.paymentReminder3SentAt),
					lte(orders.paymentDueDate, sql`now() + interval '1 day'`),
					gt(orders.paymentDueDate, sql`now()`),
				),
				with: { customer: true },
			})) as OrderWithUser[];
		});
	} catch (error) {
		console.error("[handleOrderPaymentReminders] query error:", error);
		return counts;
	}

	// Reminder 1: 8 days before due date (day 2 of 10-day window)
	const sent1: number[] = [];
	await queueEmails<OrderWithUser, number[]>(
		pendingReminder1,
		async (order, options) => {
			try {
				const { data } = await sendEmail({
					from: "Glitter Store <reservas@productoraglitter.com>",
					to: [order.customer.email],
					subject: `Tu orden #${order.id} está pendiente de pago`,
					react: OrderPaymentReminderTemplate({
						customerName: getCustomerName(order.customer),
						orderId: order.id,
						paymentDueDate: order.paymentDueDate,
					}) as React.ReactElement,
				});
				if (data) {
					options?.referenceEntity?.push(order.id);
				}
			} catch (err) {
				console.error(
					`[handleOrderPaymentReminders] sendEmail threw for order ${order.id} (reminder 1):`,
					err,
				);
			}
		},
		{ referenceEntity: sent1 },
	);
	if (sent1.length > 0) {
		await db
			.update(orders)
			.set({ paymentReminder1SentAt: sql`now()` })
			.where(inArray(orders.id, sent1));
	}
	counts.reminder1 = sent1.length;

	// Reminder 2: 5 days before due date (day 5 of 10-day window)
	const sent2: number[] = [];
	await queueEmails<OrderWithUser, number[]>(
		pendingReminder2,
		async (order, options) => {
			try {
				const { data } = await sendEmail({
					from: "Glitter Store <reservas@productoraglitter.com>",
					to: [order.customer.email],
					subject: `Tu orden #${order.id} está pendiente de pago`,
					react: OrderPaymentReminderTemplate({
						customerName: getCustomerName(order.customer),
						orderId: order.id,
						paymentDueDate: order.paymentDueDate,
					}) as React.ReactElement,
				});
				if (data) {
					options?.referenceEntity?.push(order.id);
				}
			} catch (err) {
				console.error(
					`[handleOrderPaymentReminders] sendEmail threw for order ${order.id} (reminder 2):`,
					err,
				);
			}
		},
		{ referenceEntity: sent2 },
	);
	if (sent2.length > 0) {
		await db
			.update(orders)
			.set({ paymentReminder2SentAt: sql`now()` })
			.where(inArray(orders.id, sent2));
	}
	counts.reminder2 = sent2.length;

	// Reminder 3: 1 day before due date
	const sent3: number[] = [];
	await queueEmails<OrderWithUser, number[]>(
		pendingReminder3,
		async (order, options) => {
			try {
				const { data } = await sendEmail({
					from: "Glitter Store <reservas@productoraglitter.com>",
					to: [order.customer.email],
					subject: `Tu orden #${order.id} vence mañana`,
					react: OrderPaymentWarningTemplate({
						customerName: getCustomerName(order.customer),
						orderId: order.id,
						paymentDueDate: order.paymentDueDate,
					}) as React.ReactElement,
				});
				if (data) {
					options?.referenceEntity?.push(order.id);
				}
			} catch (err) {
				console.error(
					`[handleOrderPaymentReminders] sendEmail threw for order ${order.id} (reminder 3):`,
					err,
				);
			}
		},
		{ referenceEntity: sent3 },
	);
	if (sent3.length > 0) {
		await db
			.update(orders)
			.set({ paymentReminder3SentAt: sql`now()` })
			.where(inArray(orders.id, sent3));
	}
	counts.reminder3 = sent3.length;

	return counts;
}

export async function handleOrderCancellations(): Promise<number> {
	type CancelledOrder = OrderWithUser & {
		orderItems: { productId: number; quantity: number }[];
	};

	let cancelledOrders: CancelledOrder[] = [];

	try {
		cancelledOrders = await db.transaction(async (tx) => {
			// Find overdue pending orders with their items and user
			const overdueOrders = (await tx.query.orders.findMany({
				where: and(
					eq(orders.status, "pending"),
					lte(orders.paymentDueDate, sql`now()`),
				),
				with: {
					customer: true,
					orderItems: {
						with: { product: true },
					},
				},
			})) as CancelledOrder[];

			if (overdueOrders.length === 0) return [];

			const overdueOrderIds = overdueOrders.map((o) => o.id);

			// Cancel the orders
			await tx
				.update(orders)
				.set({ status: "cancelled", updatedAt: sql`now()` })
				.where(inArray(orders.id, overdueOrderIds));

			// Restore stock for each cancelled order's items
			for (const order of overdueOrders) {
				for (const item of order.orderItems) {
					await tx
						.update(products)
						.set({
							stock: sql`COALESCE(${products.stock}, 0) + ${item.quantity}`,
						})
						.where(eq(products.id, item.productId));
				}
			}

			return overdueOrders;
		});
	} catch (error) {
		console.error("[handleOrderCancellations] error:", error);
		return 0;
	}

	// Send cancellation emails after the transaction commits — email failures
	// do not affect the already-committed order cancellations or stock restoration
	await queueEmails<CancelledOrder, undefined>(
		cancelledOrders,
		async (order) => {
			const { error } = await sendEmail({
				from: "Glitter Store <reservas@productoraglitter.com>",
				to: [order.customer.email],
				subject: `Tu orden #${order.id} fue cancelada por falta de pago`,
				react: OrderCancellationTemplate({
					customerName: getCustomerName(order.customer),
					orderId: order.id,
				}) as React.ReactElement,
			});
			if (error) {
				console.error(
					`[handleOrderCancellations] failed to send cancellation email for order ${order.id}:`,
					error,
				);
			}
		},
	);

	return cancelledOrders.length;
}
