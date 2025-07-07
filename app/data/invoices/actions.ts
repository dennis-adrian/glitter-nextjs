"use server";

import { fetchAdminUsers } from "@/app/api/users/actions";
import {
	InvoiceWithPaymentsAndStand,
	InvoiceWithPaymentsAndStandAndProfile,
	NewPayment,
} from "@/app/data/invoices/defiinitions";
import PaymentConfirmationForAdminsEmailTemplate from "@/app/emails/payment-confirmation-for-admins";
import PaymentConfirmationForUserEmailTemplate from "@/app/emails/payment-confirmation-for-user";
import { updateReservationStatus } from "@/app/lib/reservations/actions";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import { invoices, payments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

export async function fetchLatestInvoiceByProfileId(
	profileId: number,
): Promise<InvoiceWithPaymentsAndStand | undefined | null> {
	try {
		return await db.query.invoices.findFirst({
			with: {
				payments: true,
				reservation: {
					with: {
						stand: true,
						festival: {
							with: {
								festivalDates: true,
							},
						},
					},
				},
			},
			orderBy: desc(invoices.createdAt),
			where: eq(invoices.userId, profileId),
		});
	} catch (error) {
		console.error("Error fetching latest invoice", error);
		return null;
	}
}

export async function createPayment(
	data: { payment: NewPayment, oldVoucherUrl?: string; reservationId: number; standId: number; },
) {
	const { payment, oldVoucherUrl, reservationId, standId } = data;
	try {
		await db.transaction(async (tx) => {
			if (payment.id) {
				await tx
					.update(payments)
					.set({
						amount: payment.amount,
						date: payment.date,
						voucherUrl: payment.voucherUrl,
						updatedAt: new Date(),
					})
					.where(eq(payments.id, payment.id));
			} else {
				await tx.insert(payments).values(payment);
			}

			await tx
				.update(invoices)
				.set({ status: "paid" })
				.where(eq(invoices.id, payment.invoiceId));
		});

		if (oldVoucherUrl) {
			const [_, key] = oldVoucherUrl.split("/f/");
			await new UTApi().deleteFiles(key);
		}

		const invoice = await fetchInvoice(payment.invoiceId);
		if (invoice) {
			await sendEmail({
				to: [invoice.user.email],
				from: "Reservas Glitter <reservas@productoraglitter.com>",
				subject: "Tu pago ha sido registrado",
				react: PaymentConfirmationForUserEmailTemplate({
					invoice,
				}),
			});

			const admins = await fetchAdminUsers();
			const adminEmails = admins.map((admin) => admin.email);
			if (adminEmails.length > 0) {
				await sendEmail({
					to: [...adminEmails],
					from: "Reservas Glitter <reservas@productoraglitter.com>",
					subject: `${invoice.user.displayName} hizo el pago de su reserva`,
					react: PaymentConfirmationForAdminsEmailTemplate({
						invoice,
					}),
				});
			}
		}

		await updateReservationStatus({ standId, reservationId, status: 'verification_payment' })

	} catch (error) {
		console.error("Error creating payment", error);
		return {
			message: "No se pudo guardar el pago. Intenta nuevamente",
			success: false,
		};
	}

	const successMessage = payments.id
		? "Pago actualizado con éxito"
		: "Pago creado con éxito";
	return { success: true, message: successMessage };
}

export async function fetchInvoices(): Promise<
	InvoiceWithPaymentsAndStandAndProfile[]
> {
	try {
		return await db.query.invoices.findMany({
			with: {
				payments: true,
				reservation: {
					with: {
						stand: true,
						festival: {
							with: {
								festivalDates: true,
							},
						},
					},
				},
				user: true,
			},
		});
	} catch (error) {
		console.error("Error fetching invoices", error);
		return [] as InvoiceWithPaymentsAndStandAndProfile[];
	}
}

export async function fetchInvoicesByReservation(
	reservationId: number,
): Promise<InvoiceWithPaymentsAndStand[]> {
	try {
		return await db.query.invoices.findMany({
			with: {
				payments: true,
				reservation: {
					with: {
						stand: {
							with: {
								qrCode: true,
							},
						},
						festival: {
							with: {
								festivalDates: true,
							},
						},
					},
				},
			},
			where: eq(invoices.reservationId, reservationId),
		});
	} catch (error) {
		console.error("Error fetching invoices by reservation", error);
		return [];
	}
}

export async function fetchInvoice(
	id: number,
): Promise<InvoiceWithPaymentsAndStandAndProfile | undefined | null> {
	try {
		return await db.query.invoices.findFirst({
			where: eq(invoices.id, id),
			with: {
				payments: true,
				reservation: {
					with: {
						stand: true,
						festival: {
							with: {
								festivalDates: true,
							},
						},
					},
				},
				user: true,
			},
		});
	} catch (error) {
		console.error(error);
		return null;
	}
}
