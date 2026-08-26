import { z } from "zod";

import { MANAGEMENT_AREAS } from "@/app/lib/categories/definitions";

export const categoryVisibilitySchema = z.enum([
  "hidden",
  "listed",
  "selectable",
]);

export const managementAreaSchema = z.enum(MANAGEMENT_AREAS);

export const categoryEditorSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { error: "El nombre es requerido" })
    .max(120, { error: "El nombre es demasiado largo" }),
  category: managementAreaSchema,
  descriptionJson: z.unknown().nullable().optional(),
  imageUrl: z.string().trim().nullable().optional(),
  visibility: categoryVisibilitySchema,
  isExclusive: z.boolean(),
  isAdminAssignableOnly: z.boolean(),
});

export type CategoryEditorInput = z.infer<typeof categoryEditorSchema>;

export const reorderCategoriesSchema = z.object({
  category: managementAreaSchema,
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1),
});
