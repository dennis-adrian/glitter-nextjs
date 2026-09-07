import { z } from "zod";

import { slugifyName } from "@/app/lib/products/slug";

/**
 * A slug is well-formed exactly when slugifying it is a no-op.
 *
 * The previous ASCII regex disagreed with the generator: `slugifyName` keeps
 * any Unicode letter, so a title with no ASCII letters — Greek, Cyrillic, CJK —
 * produced a slug its own validator rejected, and the client sends a
 * slugified title whenever the slug field is left blank. Spanish accents strip
 * to ASCII so this never bit day to day, but the two could not disagree if one
 * is defined in terms of the other.
 */
function isWellFormedSlug(value: string): boolean {
  return value === slugifyName(value);
}

export const postFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "El título debe tener al menos 3 caracteres")
    .max(200, "El título no puede superar los 200 caracteres"),
  slug: z
    .string()
    .trim()
    .refine(
      isWellFormedSlug,
      "El slug debe ser solo minúsculas, números y guiones",
    )
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
    .union([
      z.string().trim().url("La URL de la portada no es válida"),
      z.literal(""),
    ])
    .optional(),
  seoTitle: z.string().trim().max(70).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(200).optional().or(z.literal("")),
  categoryIds: z.array(z.number().int().positive()).default([]),
  tagInputs: z
    .array(z.string().trim().min(1).max(40))
    .max(20, "Máximo 20 etiquetas por artículo")
    .default([]),
  audience: z.enum(["public", "participants"]).default("public"),
  content: z.unknown().refine((v) => Array.isArray(v) && v.length > 0, {
    message: "El contenido del artículo no puede estar vacío",
  }),
});

export type PostFormInput = z.infer<typeof postFormSchema>;

export const postAutosaveSchema = z.object({
  title: z.string().trim().max(200).default(""),
  slug: z.string().trim().max(120).optional().or(z.literal("")),
  excerpt: z.string().trim().max(280).optional().or(z.literal("")),
  coverImageUrl: z.string().trim().max(2048).optional().or(z.literal("")),
  seoTitle: z.string().trim().max(70).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(200).optional().or(z.literal("")),
  categoryIds: z.array(z.number().int().positive()).default([]),
  tagInputs: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  audience: z.enum(["public", "participants"]).default("public"),
  content: z.unknown(),
});

export type PostAutosaveInput = z.infer<typeof postAutosaveSchema>;

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

/**
 * A schedule must land in the future — a past instant would be published by
 * the very next cron sweep, which is a confusing way to spell "publish now".
 * One minute of slack absorbs the gap between picking a time and submitting.
 */
export const scheduleSchema = z.object({
  scheduledAt: z.coerce
    .date({ message: "Elegí una fecha y hora válidas" })
    .refine((value) => value.getTime() > Date.now() - 60_000, {
      message: "La fecha de publicación debe estar en el futuro",
    }),
});

export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "El comentario no puede estar vacío")
    .max(1000, "El comentario no puede superar los 1000 caracteres"),
});
