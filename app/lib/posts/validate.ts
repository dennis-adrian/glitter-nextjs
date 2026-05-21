import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const postFormSchema = z.object({
	title: z
		.string()
		.trim()
		.min(3, "El título debe tener al menos 3 caracteres")
		.max(200, "El título no puede superar los 200 caracteres"),
	slug: z
		.string()
		.trim()
		.regex(slugRegex, "El slug debe ser solo minúsculas, números y guiones")
		.max(120)
		.optional()
		.or(z.literal("")),
	excerpt: z
		.string()
		.trim()
		.max(280, "El extracto no puede superar los 280 caracteres")
		.optional()
		.or(z.literal("")),
	coverImageUrl: z
		.string()
		.trim()
		.url("La URL de la portada no es válida")
		.optional()
		.or(z.literal("")),
	seoTitle: z.string().trim().max(70).optional().or(z.literal("")),
	seoDescription: z.string().trim().max(200).optional().or(z.literal("")),
	categoryIds: z.array(z.number().int().positive()).default([]),
	tagInputs: z
		.array(z.string().trim().min(1).max(40))
		.max(20, "Máximo 20 etiquetas por artículo")
		.default([]),
	content: z.unknown().refine((v) => Array.isArray(v) && v.length > 0, {
		message: "El contenido del artículo no puede estar vacío",
	}),
	contentHtml: z.string().default(""),
});

export type PostFormInput = z.infer<typeof postFormSchema>;

export const reviewNotesSchema = z.object({
	notes: z
		.string()
		.trim()
		.min(10, "Las notas deben tener al menos 10 caracteres")
		.max(2000, "Las notas no pueden superar los 2000 caracteres"),
});

export const postCategoryFormSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, "El nombre debe tener al menos 2 caracteres")
		.max(80),
	description: z.string().trim().max(280).optional().or(z.literal("")),
});

export type PostCategoryFormInput = z.infer<typeof postCategoryFormSchema>;
