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
		socialLinks: z.array(z.url("Ingresá un enlace válido")).optional(),
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

export type LiveActInput = z.infer<typeof liveActSchema>;
