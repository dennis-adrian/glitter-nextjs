import { z } from "zod";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";

export const collectionInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "Escribe un nombre.").max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(
      /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
      "Usa una URL con letras minúsculas, números y guiones; comienza con una letra.",
    ),
  description: z.string().trim().max(2000).default(""),
  imageUrl: z
    .string()
    .trim()
    .refine(
      (value) => !value || isAllowedProgramArtworkUrl(value),
      "Sube una imagen o usa una URL de imagen permitida.",
    )
    .default(""),
  festivalId: z.number().int().positive().nullable(),
  campaignImageUrl: z
    .string()
    .trim()
    .refine(
      (value) => !value || isAllowedProgramArtworkUrl(value),
      "Sube un banner o usa una URL de imagen permitida.",
    )
    .optional(),
  campaignTextTone: z.enum(["dark", "light"]).optional(),
  showInHero: z.boolean().optional(),
  isVisible: z.boolean(),
  sortOrder: z.number().int().min(1).max(2147483647),
  productIds: z.array(z.number().int().positive()).max(1000),
});

export type CollectionInput = z.infer<typeof collectionInputSchema>;
