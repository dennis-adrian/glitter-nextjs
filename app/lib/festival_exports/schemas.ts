import { z } from "zod";
import { sectorTemplateSchema } from "@/app/lib/map_templates/schemas";

// Same scope rules as the festival_reservation_features table: only full_table
// is per category, and only late_partner has a deadline override.
export const reservationFeatureTemplateSchema = z
  .object({
    type: z.enum(["full_table", "late_partner", "reservation_release"]),
    category: z.enum(["illustration", "entrepreneurship"]).nullable(),
    enabled: z.boolean(),
    creditPrice: z.number().min(0),
    deadlineOverrideAt: z.string().datetime().nullable(),
  })
  .refine(
    (feature) =>
      (feature.type === "full_table") === (feature.category !== null) &&
      (feature.deadlineOverrideAt === null || feature.type === "late_partner"),
    { message: "Alcance de la función inválido" },
  );

export const festivalInfoTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  address: z.string().nullable(),
  locationLabel: z.string().nullable(),
  locationUrl: z.string().nullable(),
  festivalType: z.enum(["glitter", "twinkler", "festicker"]),
  mapsVersion: z.enum(["v1", "v2", "v3"]),
  publicRegistration: z.boolean(),
  eventDayRegistration: z.boolean(),
  festivalCode: z.string().nullable(),
  dates: z.array(
    z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }),
  ),
  reservationHoldMinutes: z.number().int().min(1).max(30).optional(),
  reservationFeatures: z
    .array(reservationFeatureTemplateSchema)
    .optional()
    .superRefine((features, ctx) => {
      const seen = new Set<string>();
      features?.forEach((feature, index) => {
        const scope = `${feature.type}:${feature.category ?? ""}`;
        if (seen.has(scope)) {
          ctx.addIssue({
            code: "custom",
            path: [index],
            message: "Función repetida",
          });
        }
        seen.add(scope);
      });
    }),
});

export const festivalExportSchema = z.object({
  version: z.enum(["2.0", "2.1"]),
  metadata: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    createdAt: z.string().datetime(),
    createdFrom: z
      .object({
        festivalId: z.number().int().positive(),
        festivalName: z.string(),
      })
      .optional(),
    exportOptions: z
      .object({
        includeBasicInfo: z.boolean(),
        includeSectors: z.boolean(),
      })
      .optional(),
  }),
  festival: festivalInfoTemplateSchema.optional(),
  sectors: z.array(sectorTemplateSchema).optional(),
});

export const exportFestivalDataOptionsSchema = z.object({
  includeBasicInfo: z.boolean(),
  includeSectors: z.boolean(),
  sectorIds: z.array(z.number().int().positive()).optional(),
});

export const importFestivalDataOptionsSchema = z.object({
  importBasicInfo: z.boolean(),
  importSectors: z.boolean(),
  sectorImportMode: z.enum(["replace", "create_only"]),
  nameOverride: z.string().min(1).optional(),
});
