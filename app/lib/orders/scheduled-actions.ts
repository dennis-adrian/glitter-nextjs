"use server";

import OrderCancellationTemplate from "@/app/emails/order-cancellation";
import OrderPaymentReminderTemplate from "@/app/emails/order-payment-reminder";
import OrderPaymentWarningTemplate from "@/app/emails/order-payment-warning";
import { queueEmails } from "@/app/lib/emails/helpers";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import { orders, products } from "@/db/schema";
import {
	and,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lte,
	or,
	sql,
} from "drizzle-orm";

type OrderCustomer = {
	email: string;
	displayName: string | null;
	firstName: string | null;
	lastName: string | null;
};

type OrderWithUser = {
	id: number;
	paymentDueDate: Date;
	userId: number | null;
	guestName: string | null;
	guestEmail: string | null;
	guestOrderToken: string | null;
	customer: OrderCustomer | null;
};

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

function getCustomerName(order: OrderWithUser): string {
	if (order.customer) {
		return (
			order.customer.displayName ||
			`${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim() ||
			"Cliente"
		);
	}
	return order.guestName || "Cliente";
}

function getCustomerEmail(order: OrderWithUser): string | null {
	return order.customer?.email ?? order.guestEmail ?? null;
}

function getCtaUrl(order: OrderWithUser): string {
	if (order.guestOrderToken) {
		return `${BASE_URL}/orders/${order.id}/payment?token=${order.guestOrderToken}`;
	}
	return `${BASE_URL}/my_orders`;
}

/** Copy for reminder 3 from actual time left; the DB selector only bounds the window. */
function paymentDueFinalWarningCopy(minutesRemaining: number): {
	subject: string;
	dueInPhrase: string;
} {
	if (minutesRemaining <= 0) {
		return {
			subject: "Tu pedido vence pronto",
			dueInPhrase: "vence pronto",
		};
	}
	if (minutesRemaining < 60) {
		const n = minutesRemaining;
		const unit = n === 1 ? "minuto" : "minutos";
		const phrase = `vence en ${n} ${unit}`;
		return { subject: `Tu pedido ${phrase}`, dueInPhrase: phrase };
	}
	const hours = Math.floor(minutesRemaining / 60);
	const mins = minutesRemaining % 60;
	if (mins === 0) {
		const n = hours;
		const unit = n === 1 ? "hora" : "horas";
		const phrase = `vence en ${n} ${unit}`;
		return { subject: `Tu pedido ${phrase}`, dueInPhrase: phrase };
	}
	const hUnit = hours === 1 ? "hora" : "horas";
	const mUnit = mins === 1 ? "minuto" : "minutos";
	const phrase = `vence en ${hours} ${hUnit} y ${mins} ${mUnit}`;
	return {
		subject: `Tu pedido vence en ${hours} h ${mins} min`,
		dueInPhrase: phrase,
	};
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
			// Atomically claim reminder 1 rows (also re-claims stale claims older than 1 hour)
			const claimed1 = await tx
				.update(orders)
				.set({ paymentReminder1ClaimedAt: sql`now()` })
				.where(
					and(
						eq(orders.status, "pending"),
						isNull(orders.paymentReminder1SentAt),
						or(
							isNull(orders.paymentReminder1ClaimedAt),
							lte(
								orders.paymentReminder1ClaimedAt,
								sql`now() - interval '1 hour'`,
							),
						),
						lte(orders.paymentDueDate, sql`now() + interval '42 hours'`),
						gt(orders.paymentDueDate, sql`now() + interval '12 hours'`),
					),
				)
				.returning({ id: orders.id });
			if (claimed1.length > 0) {
				pendingReminder1 = (await tx.query.orders.findMany({
					where: inArray(
						orders.id,
						claimed1.map((r) => r.id),
					),
					with: { customer: true },
				})) as OrderWithUser[];
			}

			// Atomically claim reminder 2 rows (also re-claims stale claims older than 1 hour)
			const claimed2 = await tx
				.update(orders)
				.set({ paymentReminder2ClaimedAt: sql`now()` })
				.where(
					and(
						eq(orders.status, "pending"),
						isNotNull(orders.paymentReminder1SentAt),
						isNull(orders.paymentReminder2SentAt),
						or(
							isNull(orders.paymentReminder2ClaimedAt),
							lte(
								orders.paymentReminder2ClaimedAt,
								sql`now() - interval '1 hour'`,
							),
						),
						lte(orders.paymentDueDate, sql`now() + interval '12 hours'`),
						gt(orders.paymentDueDate, sql`now() + interval '2 hours'`),
					),
				)
				.returning({ id: orders.id });
			if (claimed2.length > 0) {
				pendingReminder2 = (await tx.query.orders.findMany({
					where: inArray(
						orders.id,
						claimed2.map((r) => r.id),
					),
					with: { customer: true },
				})) as OrderWithUser[];
			}

			// Atomically claim reminder 3 rows (also re-claims stale claims older than 1 hour)
			const claimed3 = await tx
				.update(orders)
				.set({ paymentReminder3ClaimedAt: sql`now()` })
				.where(
					and(
						eq(orders.status, "pending"),
						isNotNull(orders.paymentReminder2SentAt),
						isNull(orders.paymentReminder3SentAt),
						or(
							isNull(orders.paymentReminder3ClaimedAt),
							lte(
								orders.paymentReminder3ClaimedAt,
								sql`now() - interval '1 hour'`,
							),
						),
						lte(orders.paymentDueDate, sql`now() + interval '2 hours'`),
						gt(orders.paymentDueDate, sql`now()`),
					),
				)
				.returning({ id: orders.id });
			if (claimed3.length > 0) {
				pendingReminder3 = (await tx.query.orders.findMany({
					where: inArray(
						orders.id,
						claimed3.map((r) => r.id),
					),
					with: { customer: true },
				})) as OrderWithUser[];
			}
		});
	} catch (error) {
		console.error("[handleOrderPaymentReminders] query error:", error);
		throw error;
	}

	// Reminder 1: 6 hours after order creation (42 hours remaining) — initial nudge
	const sent1: number[] = [];
	await queueEmails<OrderWithUser, number[]>(
		pendingReminder1,
		async (order, options) => {
			try {
				const email = getCustomerEmail(order);
				if (!email) {
					console.error(
						`[handleOrderPaymentReminders] no email for order ${order.id} (reminder 1), skipping`,
					);
					return;
				}
				const { data } = await sendEmail({
					from: "Glitter Store <reservas@productoraglitter.com>",
					to: [email],
					subject: "Tu pedido aún está pendiente de pago",
					react: OrderPaymentReminderTemplate({
						customerName: getCustomerName(order),
						orderId: order.id,
						paymentDueDate: order.paymentDueDate,
						ctaUrl: getCtaUrl(order),
					}) as React.ReactElement,
				});
				if (data) {
					options?.referenceEntity?.push(order.id);
				} else {
					try {
						await db
							.update(orders)
							.set({ paymentReminder1ClaimedAt: null })
							.where(eq(orders.id, order.id));
					} catch (resetErr) {
						console.error(
							`[handleOrderPaymentReminders] failed to reset claim for order ${order.id} (reminder 1):`,
							resetErr,
						);
					}
				}
			} catch (err) {
				console.error(
					`[handleOrderPaymentReminders] sendEmail threw for order ${order.id} (reminder 1):`,
					err,
				);
				try {
					await db
						.update(orders)
						.set({ paymentReminder1ClaimedAt: null })
						.where(eq(orders.id, order.id));
				} catch (resetErr) {
					console.error(
						`[handleOrderPaymentReminders] failed to reset claim for order ${order.id} (reminder 1):`,
						resetErr,
					);
				}
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

	// Reminder 2: 12 hours before due date — moderate urgency
	const sent2: number[] = [];
	await queueEmails<OrderWithUser, number[]>(
		pendingReminder2,
		async (order, options) => {
			try {
				const email = getCustomerEmail(order);
				if (!email) {
					console.error(
						`[handleOrderPaymentReminders] no email for order ${order.id} (reminder 2), skipping`,
					);
					return;
				}
				const { data } = await sendEmail({
					from: "Glitter Store <reservas@productoraglitter.com>",
					to: [email],
					subject: "Tu pedido está a punto de vencer",
					react: OrderPaymentReminderTemplate({
						customerName: getCustomerName(order),
						orderId: order.id,
						paymentDueDate: order.paymentDueDate,
						ctaUrl: getCtaUrl(order),
					}) as React.ReactElement,
				});
				if (data) {
					options?.referenceEntity?.push(order.id);
				} else {
					try {
						await db
							.update(orders)
							.set({ paymentReminder2ClaimedAt: null })
							.where(eq(orders.id, order.id));
					} catch (resetErr) {
						console.error(
							`[handleOrderPaymentReminders] failed to reset claim for order ${order.id} (reminder 2):`,
							resetErr,
						);
					}
				}
			} catch (err) {
				console.error(
					`[handleOrderPaymentReminders] sendEmail threw for order ${order.id} (reminder 2):`,
					err,
				);
				try {
					await db
						.update(orders)
						.set({ paymentReminder2ClaimedAt: null })
						.where(eq(orders.id, order.id));
				} catch (resetErr) {
					console.error(
						`[handleOrderPaymentReminders] failed to reset claim for order ${order.id} (reminder 2):`,
						resetErr,
					);
				}
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

	// Reminder 3: 2 hours before due date — final urgent warning
	const sent3: number[] = [];
	await queueEmails<OrderWithUser, number[]>(
		pendingReminder3,
		async (order, options) => {
			try {
				const email = getCustomerEmail(order);
				if (!email) {
					console.error(
						`[handleOrderPaymentReminders] no email for order ${order.id} (reminder 3), skipping`,
					);
					return;
				}
				const minutesRemaining = Math.max(
					0,
					Math.floor(
						(new Date(order.paymentDueDate).getTime() - Date.now()) / 60_000,
					),
				);
				const { subject, dueInPhrase } =
					paymentDueFinalWarningCopy(minutesRemaining);
				const { data } = await sendEmail({
					from: "Glitter Store <reservas@productoraglitter.com>",
					to: [email],
					subject,
					react: OrderPaymentWarningTemplate({
						customerName: getCustomerName(order),
						orderId: order.id,
						paymentDueDate: order.paymentDueDate,
						dueInPhrase,
						ctaUrl: getCtaUrl(order),
					}) as React.ReactElement,
				});
				if (data) {
					options?.referenceEntity?.push(order.id);
				} else {
					try {
						await db
							.update(orders)
							.set({ paymentReminder3ClaimedAt: null })
							.where(eq(orders.id, order.id));
					} catch (resetErr) {
						console.error(
							`[handleOrderPaymentReminders] failed to reset claim for order ${order.id} (reminder 3):`,
							resetErr,
						);
					}
				}
			} catch (err) {
				console.error(
					`[handleOrderPaymentReminders] sendEmail threw for order ${order.id} (reminder 3):`,
					err,
				);
				try {
					await db
						.update(orders)
						.set({ paymentReminder3ClaimedAt: null })
						.where(eq(orders.id, order.id));
				} catch (resetErr) {
					console.error(
						`[handleOrderPaymentReminders] failed to reset claim for order ${order.id} (reminder 3):`,
						resetErr,
					);
				}
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
			// Atomically cancel all overdue pending orders; only rows this UPDATE claims
			// are processed — prevents double stock restores under overlapping runs
			const claimed = await tx
				.update(orders)
				.set({ status: "cancelled", updatedAt: sql`now()` })
				.where(
					and(
						eq(orders.status, "pending"),
						lte(orders.paymentDueDate, sql`now()`),
					),
				)
				.returning({ id: orders.id });

			if (claimed.length === 0) return [];

			// Load full order data only for the rows we atomically claimed
			const cancelledOrders = (await tx.query.orders.findMany({
				where: inArray(
					orders.id,
					claimed.map((r) => r.id),
				),
				with: {
					customer: true,
					orderItems: {
						with: { product: true },
					},
				},
			})) as CancelledOrder[];

			// Restore stock for each cancelled order's items
			for (const order of cancelledOrders) {
				for (const item of order.orderItems) {
					await tx
						.update(products)
						.set({
							stock: sql`COALESCE(${products.stock}, 0) + ${item.quantity}`,
						})
						.where(eq(products.id, item.productId));
				}
			}

			return cancelledOrders;
		});
	} catch (error) {
		console.error("[handleOrderCancellations] error:", error);
		throw error;
	}

	// Send cancellation emails after the transaction commits — email failures
	// do not affect the already-committed order cancellations or stock restoration
	await queueEmails<CancelledOrder, undefined>(
		cancelledOrders,
		async (order) => {
			const email = getCustomerEmail(order);
			if (!email) {
				console.error(
					`[handleOrderCancellations] no email for order ${order.id}, skipping cancellation email`,
				);
				return;
			}
			const { error } = await sendEmail({
				from: "Glitter Store <reservas@productoraglitter.com>",
				to: [email],
				subject: `Tu orden #${order.id} fue cancelada por falta de pago`,
				react: OrderCancellationTemplate({
					customerName: getCustomerName(order),
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
