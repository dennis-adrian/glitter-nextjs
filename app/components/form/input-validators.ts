import { formatDate } from "@/app/lib/formatters";
import { isPhoneValid } from "@/app/lib/phone-validator";
import { z } from "zod";

export const birthdateValidator = ({
	minAge,
	minAgeMessage,
}: {
	minAge?: number;
	minAgeMessage?: string;
}) => {
	if (minAge) {
		return z.coerce
			.date()
			.refine((date) => date < new Date(), {
				message: "La fecha de nacimiento no puede ser en el futuro",
			})
			.refine(
				(date) => {
					const ageLimit = formatDate(new Date()).minus({ years: minAge });
					return formatDate(date).startOf("day") < ageLimit.startOf("day");
				},
				{
					message: minAgeMessage || `La edad mínima es de ${minAge} años`,
				},
			);
	}

	return z.coerce.date().refine((date) => date < new Date(), {
		message: "La fecha de nacimiento no puede ser en el futuro",
	});
};

export const phoneValidator = () => {
	return z.string().refine((phone) => isPhoneValid(phone), {
		message: "El número de teléfono no es válido",
	});
};
