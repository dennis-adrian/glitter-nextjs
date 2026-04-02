import { z } from "zod";

import {
	nameValidator,
	phoneValidator,
} from "@/app/components/form/input-validators";
import { liveActCategoryEnum } from "@/db/schema";

export const liveActSchema = z
	.object({
		actName: z
			.string()
			.trim()
			.min(3, "El nombre del acto debe tener al menos 3 caracteres"),
		category: z.enum(liveActCategoryEnum.enumValues, {
			error: "Seleccioná una categoría",
		}),
		description: z.string().trim().optional(),
		resourceLink: z.url("Ingresá un enlace válido"),
		socialLinks: z
			.array(z.string())
			.optional()
			.transform((arr) =>
				(arr ?? []).map((s) => s.trim()).filter((s) => s.length > 0),
			)
			.pipe(
				z
					.array(z.url("Ingresá un enlace válido"))
					.max(5, "No se permiten más de 5 enlaces"),
			),
		contactName: nameValidator(),
		contactEmail: z.email("Ingresá un email válido"),
		contactPhone: phoneValidator(),
	})
	.refine(
		(data) =>
			data.category !== "talk" ||
			(!!data.description && data.description.trim().length >= 20),
		{
			message: "La descripción debe tener al menos 20 caracteres",
			path: ["description"],
		},
	);

/** Parsed payload after Zod transforms (e.g. trimmed, filtered social links). */
export type LiveActInput = z.output<typeof liveActSchema>;
/** Raw react-hook-form values before Zod transforms. */
export type LiveActFormValues = z.input<typeof liveActSchema>;
