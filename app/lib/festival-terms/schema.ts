import { z } from "zod";

import {
  TERMS_AUDIENCE_CATEGORIES,
  TERMS_FESTIVAL_TYPES,
  TERMS_SECTION_LAYOUTS,
} from "@/app/lib/festival-terms/constants";
import { richTextBodyHasVisibleContent } from "@/app/lib/festival-terms/html";

export const termsAudienceCategorySchema = z.enum(TERMS_AUDIENCE_CATEGORIES);
export const termsFestivalTypeSchema = z.enum(TERMS_FESTIVAL_TYPES);

export const EXACTLY_ONE_SCHEDULE_MESSAGE =
  "Tiene que haber exactamente una sección de horarios. Podés moverla, no eliminarla ni editar los horarios.";

export const RICH_TEXT_TITLE_REQUIRED_MESSAGE =
  "Cada sección de texto necesita un título";

export const RICH_TEXT_BODY_REQUIRED_MESSAGE =
  "Cada sección de texto necesita contenido";

export const NO_PARTICIPANT_VISIBLE_CONTENT_MESSAGE =
  "Publicá al menos una sección de texto con contenido";

const sectionAudienceFields = {
  audienceCategories: z.array(termsAudienceCategorySchema),
  audienceFestivalTypes: z.array(termsFestivalTypeSchema),
};

const richTextSectionSchema = z.object({
  clientId: z.string().min(1),
  kind: z.literal("rich_text"),
  layout: z.enum(TERMS_SECTION_LAYOUTS),
  title: z
    .string()
    .trim()
    .min(1, { error: RICH_TEXT_TITLE_REQUIRED_MESSAGE })
    .max(200),
  bodyJson: z.unknown().refine(richTextBodyHasVisibleContent, {
    error: RICH_TEXT_BODY_REQUIRED_MESSAGE,
  }),
  ...sectionAudienceFields,
});

const scheduleSectionSchema = z.object({
  clientId: z.string().min(1),
  kind: z.literal("schedule"),
  layout: z.enum(TERMS_SECTION_LAYOUTS),
  title: z.string().trim().max(200),
  bodyJson: z.unknown().nullable(),
  ...sectionAudienceFields,
});

export const editorTermsSectionSchema = z.discriminatedUnion("kind", [
  richTextSectionSchema,
  scheduleSectionSchema,
]);

export function scheduleSectionCount(
  sections: Array<{ kind: string }>,
): number {
  return sections.filter((section) => section.kind === "schedule").length;
}

export function hasParticipantVisibleTermsContent(
  sections: Array<{ kind: string; bodyJson?: unknown }>,
): boolean {
  return sections.some(
    (section) =>
      section.kind === "rich_text" &&
      richTextBodyHasVisibleContent(section.bodyJson),
  );
}

function refineExactlyOneSchedule(
  data: { sections: Array<{ kind: string }> },
  ctx: z.RefinementCtx,
) {
  if (scheduleSectionCount(data.sections) !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["sections"],
      message: EXACTLY_ONE_SCHEDULE_MESSAGE,
    });
  }
}

export const saveDraftSchema = z
  .object({
    changelog: z.string().trim().max(2000).optional(),
    sections: z.array(editorTermsSectionSchema).min(1, {
      error: "Agregá al menos una sección",
    }),
  })
  .superRefine(refineExactlyOneSchedule);

/**
 * Used by `publishFestivalTermsDraft` before any DB write.
 * Participant-visible content = at least one `rich_text` section whose
 * `bodyJson` would not render as empty under `renderTermsSectionHtml`
 * (see `richTextBodyHasVisibleContent`). Schedule alone is not enough.
 */
export const publishDraftSchema = z
  .object({
    changelog: z.string().trim().max(2000).optional(),
    sections: z.array(editorTermsSectionSchema).min(1, {
      error: "Agregá al menos una sección",
    }),
  })
  .superRefine((data, ctx) => {
    refineExactlyOneSchedule(data, ctx);
    if (!hasParticipantVisibleTermsContent(data.sections)) {
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: NO_PARTICIPANT_VISIBLE_CONTENT_MESSAGE,
      });
    }
  });

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type PublishDraftInput = z.infer<typeof publishDraftSchema>;
