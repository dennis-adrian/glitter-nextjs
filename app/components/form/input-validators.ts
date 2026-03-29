import { formatDate } from "@/app/lib/formatters";
import { isPhoneValid } from "@/app/lib/phone-validator";
import { z } from "zod";

/** Letters (any script), spaces, hyphens, apostrophes — typical personal names only. */
const NAME_CHARS_REGEX = /^[\p{L}\s'-]+$/u;

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
				error: "La fecha de nacimiento no puede ser en el futuro",
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
		error: "La fecha de nacimiento no puede ser en el futuro",
	});
};

export const phoneValidator = () => {
	return z.string().refine((phone) => isPhoneValid(phone), {
		error: "El número de teléfono no es válido",
	});
};

export const nameValidator = () => {
	return z
		.string({
			error: "El nombre es requerido",
		})
		.trim()
		.min(2, {
			error: "El nombre debe tener al menos dos letras",
		})
		.regex(
			NAME_CHARS_REGEX,
			"Usá solo letras, espacios y guiones para tu nombre",
		);
};

/** Guest checkout contact fields — shared by `GuestCheckoutForm` and `checkoutGuestCart`. */
export const guestCheckoutContactSchema = z.object({
	name: nameValidator(),
	email: z.email("Ingresá un email válido"),
	phone: phoneValidator(),
});

export type GuestCheckoutContactInput = z.infer<typeof guestCheckoutContactSchema>;
