import { infractionSeverityEnum } from "@/db/schema";

export const infractionSeverityLabel: Record<
	(typeof infractionSeverityEnum.enumValues)[number],
	string
> = {
	low: "Severidad Baja",
	medium: "Severidad Media",
	high: "Severidad Alta",
	critical: "Severidad Crítica",
};

export const getInfractionStatusLabel = (handled: boolean) => {
	if (handled) {
		return "Resuelta";
	}
	return "Pendiente de resolución";
};
