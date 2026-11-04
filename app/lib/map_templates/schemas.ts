import { z } from "zod";

const standCategorySchema = z.enum([
  "none",
  "illustration",
  "gastronomy",
  "entrepreneurship",
  "new_artist",
]);

// Stand template schema
export const standTemplateSchema = z.object({
  label: z.string().nullable(),
  standNumber: z.number().int().min(1),
  standCategory: standCategorySchema,
  zone: z.enum(["main", "secondary"]),
  orientation: z.enum(["portrait", "landscape"]),
  width: z.number().nullable(),
  height: z.number().nullable(),
  positionLeft: z.number().finite(),
  positionTop: z.number().finite(),
  price: z.number().min(0),
  individualPrice: z.number().min(0).optional(),
  sharedPrice: z.number().min(0).nullable().optional(),
  participationType: z.enum(["standard", "live_activity"]).optional(),
  subcategories: z
    .array(
      z.object({
        category: standCategorySchema,
        label: z.string().min(1),
      }),
    )
    .optional(),
});

export const standGroupTemplateSchema = z.object({
  type: z.enum(["visual_group", "full_table"]),
  fullTablePrice: z.number().min(0).nullable(),
  standIndexes: z.array(z.number().int().min(0)).min(1),
});

// Map element template schema
export const mapElementTemplateSchema = z.object({
  type: z.enum([
    "entrance",
    "stage",
    "door",
    "bathroom",
    "label",
    "custom",
    "stairs",
  ]),
  label: z.string().nullable(),
  labelPosition: z.enum(["left", "right", "top", "bottom"]).optional(),
  labelFontSize: z.number().positive().optional(),
  showIcon: z.boolean().optional(),
  labelFontWeight: z.number().min(100).max(900).optional(),
  rotation: z.number().finite().optional(),
  positionLeft: z.number().finite(),
  positionTop: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});

// Sector template schema
export const sectorTemplateSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable(),
    orderInFestival: z.number().int().min(1),
    mapBounds: z.object({
      originX: z.number().nullable(),
      originY: z.number().nullable(),
      width: z.number().nullable(),
      height: z.number().nullable(),
    }),
    stands: z.array(standTemplateSchema),
    elements: z.array(mapElementTemplateSchema).optional(),
    groups: z.array(standGroupTemplateSchema).optional(),
  })
  // Cross-row rules a field schema cannot express. The database enforces the
  // price ordering too; checking here turns a constraint violation halfway
  // through an import into a file that is refused before anything is written.
  .superRefine((sector, ctx) => {
    sector.stands.forEach((stand, index) => {
      const individual = stand.individualPrice ?? stand.price;
      if (stand.sharedPrice != null && stand.sharedPrice < individual) {
        ctx.addIssue({
          code: "custom",
          path: ["stands", index, "sharedPrice"],
          message: "El precio compartido no puede ser menor al individual",
        });
      }
    });

    const grouped = new Set<number>();
    (sector.groups ?? []).forEach((group, index) => {
      for (const standIndex of group.standIndexes) {
        if (standIndex >= sector.stands.length) {
          ctx.addIssue({
            code: "custom",
            path: ["groups", index, "standIndexes"],
            message: "El grupo apunta a un espacio que no existe",
          });
        } else if (grouped.has(standIndex)) {
          ctx.addIssue({
            code: "custom",
            path: ["groups", index, "standIndexes"],
            message: "Un espacio no puede estar en dos grupos",
          });
        }
        grouped.add(standIndex);
      }
      if (group.type === "full_table" && group.standIndexes.length !== 2) {
        ctx.addIssue({
          code: "custom",
          path: ["groups", index, "standIndexes"],
          message: "Una mesa completa son exactamente dos espacios",
        });
      }
      if (group.type !== "full_table" && group.fullTablePrice != null) {
        ctx.addIssue({
          code: "custom",
          path: ["groups", index, "fullTablePrice"],
          message: "Solo una mesa completa tiene precio de mesa",
        });
      }
    });
  });

// Full map template schema
export const mapTemplateSchema = z.object({
  version: z.enum(["1.0", "1.1", "1.2"]),
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
  }),
  sectors: z.array(sectorTemplateSchema).min(1),
});

// Import options schema
export const importOptionsSchema = z.object({
  mode: z.enum(["replace", "create_only"]),
  targetSectorId: z.number().int().positive().optional(),
});

// Export options schema
export const exportOptionsSchema = z.object({
  sectorIds: z.array(z.number().int().positive()).optional(),
});

// Template save schema (for saving to database)
export const saveTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  template: mapTemplateSchema,
});

// Type exports from schemas
export type StandTemplateInput = z.infer<typeof standTemplateSchema>;
export type SectorTemplateInput = z.infer<typeof sectorTemplateSchema>;
export type MapTemplateInput = z.infer<typeof mapTemplateSchema>;
export type ImportOptionsInput = z.infer<typeof importOptionsSchema>;
export type ExportOptionsInput = z.infer<typeof exportOptionsSchema>;
export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;
