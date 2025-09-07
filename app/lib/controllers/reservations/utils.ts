import { DisplaySanction } from "@/app/lib/controllers/reservations/types";
import {
	UserSanctionBase,
	UserSanctionFull,
} from "@/app/lib/users/definitions";

const mapDelayUnitToDisplayDelayUnit = (
	delayUnit: UserSanctionBase["durationUnit"],
): string => {
	switch (delayUnit) {
		case "minutes":
			return "minutos";
		case "hours":
			return "horas";
		case "days":
			return "días";
		case "months":
			return "meses";
		case "years":
			return "años";
		case "festivals":
			return "festivales";
		default:
			return "indefinidamente";
	}
};

export const mapSanctionToDisplaySanction = (
	sanction: UserSanctionFull,
): DisplaySanction => {
	let sanctionType: string = sanction.type;

	switch (sanction.type) {
		case "reservation_delay":
			sanctionType = "Retraso en la reserva";
			break;
		case "ban":
			sanctionType = "Baneo";
			break;
		case "warning":
			sanctionType = "Advertencia";
			break;
		default:
			sanctionType = "Sanción desconocida";
			break;
	}

	let sanctionDuration = `${sanction.duration} ${mapDelayUnitToDisplayDelayUnit(sanction.durationUnit)}`;

	if (sanction.type == "reservation_delay") {
		sanctionDuration += " desde la habilitación de las reservas";
	}

	let sanctionTypeDescription = "";
	if (sanction.type == "reservation_delay") {
		sanctionTypeDescription =
			"El usuario debe esperar un tiempo antes de poder hacer su reserva";
	}

	return {
		id: sanction.id,
		type: sanctionType,
		infractionDescription: sanction.infraction.description || "",
		description: sanctionTypeDescription,
		duration: sanctionDuration,
	};
};
