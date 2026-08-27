import { z } from "zod";

import {
  TERMS_AUDIENCE_CATEGORIES,
  TERMS_FESTIVAL_TYPES,
  TERMS_SECTION_KINDS,
  TERMS_SECTION_LAYOUTS,
} from "@/app/lib/festival-terms/constants";

export const termsAudienceCategorySchema = z.enum(TERMS_AUDIENCE_CATEGORIES);
export const termsFestivalTypeSchema = z.enum(TERMS_FESTIVAL_TYPES);

export const editorTermsSectionSchema = z.object({
  clientId: z.string().min(1),
  kind: z.enum(TERMS_SECTION_KINDS),
  layout: z.enum(TERMS_SECTION_LAYOUTS),
  title: z.string().trim().max(200),
  bodyJson: z.unknown().nullable(),
  audienceCategories: z.array(termsAudienceCategorySchema),
  audienceFestivalTypes: z.array(termsFestivalTypeSchema),
});

export const EXACTLY_ONE_SCHEDULE_MESSAGE =
  "Tiene que haber exactamente una sección de horarios. Podés moverla, no eliminarla ni editar los horarios.";

export function scheduleSectionCount(
  sections: Array<{ kind: string }>,
): number {
  return sections.filter((section) => section.kind === "schedule").length;
}

export const saveDraftSchema = z
  .object({
    changelog: z.string().trim().max(2000).optional(),
    sections: z.array(editorTermsSectionSchema).min(1, {
      error: "Agregá al menos una sección",
    }),
  })
  .superRefine((data, ctx) => {
    if (scheduleSectionCount(data.sections) !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: EXACTLY_ONE_SCHEDULE_MESSAGE,
      });
    }
  });

export const publishDraftSchema = saveDraftSchema;

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type PublishDraftInput = z.infer<typeof publishDraftSchema>;
