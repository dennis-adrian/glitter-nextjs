export type QrCodeStatus = "active" | "expiring_soon" | "expired";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function getQrCodeStatus(
	expirationDate: Date | string,
	now: Date = new Date(),
): QrCodeStatus {
	const exp =
		expirationDate instanceof Date ? expirationDate : new Date(expirationDate);
	if (Number.isNaN(exp.getTime())) {
		throw new TypeError("Invalid expirationDate");
	}
	const diff = exp.getTime() - now.getTime();
	if (diff <= 0) return "expired";
	if (diff <= SEVEN_DAYS_MS) return "expiring_soon";
	return "active";
}

export const qrCodeStatusLabels: Record<QrCodeStatus, string> = {
	active: "Activo",
	expiring_soon: "Por vencer",
	expired: "Vencido",
};
