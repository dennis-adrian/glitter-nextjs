"use server";

import { z } from "zod";

import { normalizeAnnouncementDoc } from "@/app/lib/comunicados/content";
import {
  COMUNICADO_UNTITLED,
  ComunicadoDraftSchema,
} from "@/app/lib/comunicados/definitions";
import { renderComunicadoEmail } from "@/app/lib/comunicados/email";
import { excerptOf } from "@/app/lib/comunicados/text";
import { UNSUBSCRIBE_PAGE_PATH } from "@/app/lib/emails/unsubscribe-links";
import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";
import { publicBaseUrl } from "@/app/lib/urls";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";
import { serverEnv } from "@/env";

const PreviewSchema = ComunicadoDraftSchema.pick({
  title: true,
  doc: true,
  actionLabel: true,
  actionPath: true,
}).extend({
  /** Only the admin's own preview prints it, escaped. */
  essentialFestivalName: z.string().trim().max(200).nullish(),
});

const PREVIEW_FAILED = "No se pudo generar la vista previa.";

/**
 * The composer's "Vista previa" (docs/IMPLEMENTATION-comunicados.md G4): the
 * detail page's HTML, the excerpt and the email, all rendered on the server
 * from the composer's current fields. A half-written draft still previews:
 * the content is normalized at the draft stage, an empty title shows as
 * "Sin título" and the button shows once it has a label and a Glitter path.
 * Sends and saves nothing.
 */
export async function renderComunicadoPreviewAction(input: unknown): Promise<
  | {
      success: true;
      /** `blocksToSanitizedHtml(blocks, "announcement")`, for `RichTextHtml`. */
      detailHtml: string;
      excerpt: string;
      email: { subject: string; html: string; from: string };
    }
  | { success: false; message: string }
> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }
  const blocked = await featureFlagGuard("comunicados", actor);
  if (blocked) return blocked;

  const parsed = PreviewSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: PREVIEW_FAILED };
  const fields = parsed.data;

  const content = normalizeAnnouncementDoc(fields.doc, { stage: "draft" });
  if (!content.ok) return { success: false, message: content.message };

  try {
    const baseUrl = publicBaseUrl();
    const email = await renderComunicadoEmail({
      title: fields.title.replace(/\s+/g, " ").trim() || COMUNICADO_UNTITLED,
      blocks: content.blocks,
      actionLabel: fields.actionLabel,
      actionPath: fields.actionPath,
      greetingName: getUserName(actor),
      // Never a working link: the page refuses this token, so following it
      // from the preview unsubscribes nobody.
      unsubscribeUrl: `${baseUrl}${UNSUBSCRIBE_PAGE_PATH}?token=preview`,
      essentialFestivalName: fields.essentialFestivalName,
      staging: serverEnv.VERCEL_ENV !== "production",
      test: false,
      baseUrl,
    });
    return {
      success: true,
      detailHtml: await blocksToSanitizedHtml(content.blocks, "announcement"),
      excerpt: excerptOf(content.text),
      email: { subject: email.subject, html: email.html, from: email.from },
    };
  } catch (error) {
    console.error("Error rendering a comunicado preview", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { success: false, message: PREVIEW_FAILED };
  }
}
