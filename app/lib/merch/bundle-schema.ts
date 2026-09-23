import { z } from "zod";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";

export const MAX_BUNDLE_COMPONENTS = 20;
export const MAX_BUNDLE_COMPONENT_QUANTITY = 99;
/** Bundle lines follow the same per-line cap as individual cart lines. */
export const MAX_CART_BUNDLE_QUANTITY = 5;

const isWholeCents = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

export const bundleComponentInputSchema = z.object({
  id: z.number().int().positive().optional(),
  productId: z.number().int().positive(),
  quantity: z
    .number()
    .int("La cantidad debe ser un número entero.")
    .min(1, "La cantidad mínima es 1.")
    .max(MAX_BUNDLE_COMPONENT_QUANTITY),
  variantIds: z.array(z.number().int().positive()).max(200),
});

export const bundleInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "Escribe un nombre.").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "Escribe el identificador de URL.")
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
  price: z
    .number("Ingresa el precio del combo.")
    .positive("El precio del combo debe ser mayor a cero.")
    .max(99_999_999.99)
    .refine(isWholeCents, "Usa como máximo dos decimales."),
  isVisible: z.boolean(),
  sortOrder: z.number().int().min(1).max(2147483647),
  components: z
    .array(bundleComponentInputSchema)
    .min(1, "Agrega al menos un producto.")
    .max(
      MAX_BUNDLE_COMPONENTS,
      `Un combo admite hasta ${MAX_BUNDLE_COMPONENTS} productos.`,
    ),
  collectionIds: z.array(z.number().int().positive()).max(200),
});

export type BundleInput = z.input<typeof bundleInputSchema>;
export type BundleComponentInput = z.infer<typeof bundleComponentInputSchema>;

export const bundleSelectionSchema = z
  .array(
    z.object({
      componentId: z.number().int().positive(),
      productVariantId: z.number().int().positive(),
    }),
  )
  .max(MAX_BUNDLE_COMPONENTS);

export const bundleLineRequestSchema = z.object({
  bundleId: z.number().int().positive(),
  bundleVersion: z.number().int().positive(),
  quantity: z.number().int().positive().max(MAX_CART_BUNDLE_QUANTITY),
  selections: bundleSelectionSchema,
});

export type BundleLineRequest = z.infer<typeof bundleLineRequestSchema>;
