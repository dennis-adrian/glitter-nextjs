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

export const saveDraftSchema = z.object({
  changelog: z.string().trim().max(2000).optional(),
  sections: z.array(editorTermsSectionSchema).min(1, {
    error: "Agregá al menos una sección",
  }),
});

export const publishDraftSchema = saveDraftSchema.extend({
  changelog: z.string().trim().max(2000).optional(),
});

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type PublishDraftInput = z.infer<typeof publishDraftSchema>;
