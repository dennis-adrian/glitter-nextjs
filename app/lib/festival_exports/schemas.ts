import { z } from "zod";
import { sectorTemplateSchema } from "@/app/lib/map_templates/schemas";

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
});

export const festivalExportSchema = z.object({
  version: z.literal("2.0"),
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
