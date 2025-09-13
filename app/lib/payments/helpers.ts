import { UserCategory } from "@/app/api/users/definitions";
import { InvoiceBase, InvoiceStatus } from "@/app/data/invoices/definitions";
import { FestivalBase } from "../festivals/definitions";
import { DateTime } from "luxon";
import { ReservationBase } from "@/app/api/reservations/definitions";
import { formatDate } from "@/app/lib/formatters";

export function getInvoiceStatusLabel(status: InvoiceStatus) {
	switch (status) {
		case "pending":
			return "Pendiente";
		case "paid":
			return "Pagado";
		case "cancelled":
			return "Cancelado";
	}
}

export function getPaymentQrCodeUrlByCategory(
	festival: FestivalBase,
	category: Exclude<UserCategory, "none">,
) {
	if (category === "illustration" || category === "new_artist") {
		return festival.illustrationPaymentQrCodeUrl;
	}

	if (category === "entrepreneurship") {
		return festival.entrepreneurshipPaymentQrCodeUrl;
	}

	if (category === "gastronomy") {
		return festival.gastronomyPaymentQrCodeUrl;
	}
}

export function getStandUrlByCategory(
	festival: FestivalBase,
	category: Exclude<UserCategory, "none">,
) {
	if (category === "illustration" || category === "new_artist") {
		return festival.illustrationStandUrl;
	}

	if (category === "gastronomy") {
		return festival.gastronomyStandUrl;
	}

	if (category === "entrepreneurship") {
		return festival.entrepreneurshipStandUrl;
	}
}

export function mapPaymentStatusToDisplayPaymentStatus(
	invoice: InvoiceBase,
	reservation: ReservationBase,
): DisplayPaymentStatus {
	const paymentDateDiff = DateTime.now().diff(
		formatDate(invoice.createdAt),
		"days",
	).days;

	const isOutstanding =
		paymentDateDiff > 5 &&
		invoice.status === "pending" &&
		reservation.status !== "accepted";
	if (isOutstanding) return DisplayPaymentStatus.OUTSTANDING;

	switch (invoice.status) {
		case "pending":
			return DisplayPaymentStatus.PENDING;
		case "paid":
			return DisplayPaymentStatus.PAID;
		case "cancelled":
			return DisplayPaymentStatus.CANCELLED;
		default:
			return DisplayPaymentStatus.NONE;
	}
}

export enum DisplayPaymentStatus {
	PENDING = "Pendiente",
	PAID = "Pagado",
	CANCELLED = "Cancelado",
	OUTSTANDING = "Atrasado",
	NONE = "--",
}
