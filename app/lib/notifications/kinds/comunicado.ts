import { z } from "zod";

import {
  COMUNICADO_EXCERPT_MAX,
  COMUNICADO_MISSED_REASONS,
  COMUNICADO_TITLE_MAX,
} from "@/app/lib/comunicados/definitions";
import { formatDisplayDate } from "@/app/lib/formatters";
import type { KindDefinition } from "@/app/lib/notifications/kinds/types";

/**
 * Comunicados (docs/IMPLEMENTATION-comunicados.md A7, G9). The participant's
 * item has no email here: its email goes through the bulk lane, which renders
 * it per batch. It pushes only when its sender ticked the device.
 */

const serialId = z.number().int().positive();

const comunicadoSchema = z.object({
  comunicadoId: serialId,
  revision: z.number().int().min(1),
  title: z.string().min(1).max(COMUNICADO_TITLE_MAX),
  // The excerpt is cut at 280 and may end in "…".
  excerpt: z.string().max(COMUNICADO_EXCERPT_MAX + 1),
  actionPath: z.string().nullable(),
  actionLabel: z.string().nullable(),
});

const comunicadoNotSentSchema = z.object({
  comunicadoId: serialId,
  title: z.string(),
  reason: z.enum(COMUNICADO_MISSED_REASONS),
  /**
   * The refusal as a clause, lower-case and with no final period, spliced
   * into the body; for `too_large` and `invalid`, else null.
   */
  detail: z.string().max(300).nullable(),
  /** ISO instant the send was programmed for. */
  scheduledAt: z.string(),
  audienceCount: z.number().int().nullable(),
});
export type ComunicadoNotSentData = z.infer<typeof comunicadoNotSentSchema>;

/** "sáb 31 oct, 9:00 AM", in Bolivia time. */
function scheduledLabel(iso: string) {
  return formatDisplayDate(iso, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * G9's body, by reason. A missed draft's banner shows the same sentence
 * (E4): the miss stores it in `schedule_missed_detail`.
 */
export function comunicadoNotSentBody(data: ComunicadoNotSentData) {
  const detail = data.detail?.trim();
  switch (data.reason) {
    case "late":
      return `Estaba programado para el ${scheduledLabel(data.scheduledAt)} y el envío se atrasó más de una hora. Quedó como borrador para que lo revises.`;
    case "too_large":
    case "invalid":
      return detail
        ? `Al enviarlo, ${detail}. Quedó como borrador.`
        : "Al enviarlo, algo de la audiencia no se pudo usar. Quedó como borrador.";
    case "empty":
      return "Al enviarlo, nadie de la audiencia podía recibirlo. Quedó como borrador.";
    case "sender_not_admin":
      return "La persona que lo programó ya no es administradora, así que no se envió. Quedó como borrador.";
  }
}

export const comunicadoKinds = {
  /** A comunicado, to each participant it reached. */
  comunicado: {
    category: "announcements",
    schema: comunicadoSchema,
    inApp: (data) => ({
      title: data.title,
      body: data.excerpt,
      actionPath: data.actionPath,
      actionLabel: data.actionPath ? data.actionLabel : null,
    }),
    // Text someone wrote: the item opens its own page to be read whole.
    opensDetail: () => true,
    push: "per_send",
  } satisfies KindDefinition<z.infer<typeof comunicadoSchema>>,

  /** To the admin who scheduled it, when the release refused to send. */
  comunicado_not_sent: {
    category: "admin",
    schema: comunicadoNotSentSchema,
    inApp: (data) => ({
      title: `No se envió «${data.title}»`,
      body: comunicadoNotSentBody(data),
      actionPath: `/dashboard/communications/${data.comunicadoId}`,
      actionLabel: "Ver comunicado",
    }),
  } satisfies KindDefinition<ComunicadoNotSentData>,
} as const;
