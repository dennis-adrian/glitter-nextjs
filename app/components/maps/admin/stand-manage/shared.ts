export const STAND_STATUS_OPTIONS = [
	{ value: "available", label: "Disponible" },
	{ value: "held", label: "En espera" },
	{ value: "reserved", label: "Reservado" },
	{ value: "confirmed", label: "Confirmado" },
	{ value: "disabled", label: "Deshabilitado" },
] as const;

export type StandStatus = (typeof STAND_STATUS_OPTIONS)[number]["value"];

export const CATEGORY_OPTIONS = [
	{ value: "none", label: "Ninguna" },
	{ value: "illustration", label: "Ilustración" },
	{ value: "gastronomy", label: "Gastronomía" },
	{ value: "entrepreneurship", label: "Emprendimiento" },
	{ value: "new_artist", label: "Artista nuevo" },
] as const;

export type StandCategory = (typeof CATEGORY_OPTIONS)[number]["value"];

export const RESERVATION_OPTIONS = [
	{ value: "yes", label: "Con reserva" },
	{ value: "no", label: "Sin reserva" },
] as const;

export const CONFIRMATION_THRESHOLD = 20;

export function formatPrice(amount: number) {
	return new Intl.NumberFormat("es-BO", {
		style: "currency",
		currency: "BOB",
		minimumFractionDigits: 2,
	}).format(amount);
}

export function getStatusLabel(status: StandStatus) {
	return STAND_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function getCategoryLabel(category: StandCategory) {
	return CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category;
}

export function standDisplayLabel(label: string | null, standNumber: number) {
	return `${label ?? ""}${standNumber}`;
}
