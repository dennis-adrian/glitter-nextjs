import { DateTime } from "luxon";
import { z } from "zod";

import {
  getInfractionEmailCopy,
  type InfractionEmailKind,
} from "@/app/emails/infraction-lifecycle";
import {
  getSanctionDescription,
  getSanctionEmailCopy,
  getSanctionScopeDescription,
  type SanctionEmailKind,
} from "@/app/emails/sanction-lifecycle";
import { formatDisplayDate } from "@/app/lib/formatters";
import { atTime, SUPPORT_LINE } from "@/app/lib/notifications/kinds/copy";
import type { KindDefinition } from "@/app/lib/notifications/kinds/types";

/**
 * The inbox copies of the disciplinary outbox's emails (phase 2). In-app only,
 * like the reservation mirrors. Titles and note labels come from the email
 * modules, so each notice is worded once.
 *
 * Every one is `sensitive`: a push says only that something arrived. Notes
 * are the participant-facing texts the outbox already sends (a resolution,
 * void or revocation reason), never an admin's edit reason.
 */

const infractionSchema = z.object({
  infractionId: z.number().int().positive(),
  /** The recipient's own profile: their history sits under it. */
  profileId: z.number().int().positive(),
  typeLabel: z.string(),
  festivalName: z.string().nullable(),
  note: z.string().nullable(),
});

const sanctionSchema = z.object({
  sanctionId: z.number().int().positive(),
  profileId: z.number().int().positive(),
  typeLabel: z.string(),
  scopeLabel: z.string(),
  infractionLabels: z.array(z.string()),
  note: z.string().nullable(),
  festivalName: z.string().nullable(),
  /** Only for reservation access, to link to that festival's map. */
  festivalId: z.number().int().positive().nullable(),
  reservationEligibleAt: z.string().datetime().nullable(),
});

type InfractionData = z.infer<typeof infractionSchema>;
type SanctionData = z.infer<typeof sanctionSchema>;

function historyPath(data: { profileId: number }) {
  return `/profiles/${data.profileId}/infractions`;
}

/** The body, its note as a paragraph of its own, and the support line. */
function withNote(body: string, label: string, note: string | null) {
  return `${note ? `${body}\n\n${label} ${note}` : body}\n\n${SUPPORT_LINE}`;
}

function infractionBody(kind: InfractionEmailKind, data: InfractionData) {
  const festival = data.festivalName
    ? `Corresponde a tu participación en ${data.festivalName}.`
    : "No está relacionada con un festival específico.";
  switch (kind) {
    case "registered":
    case "edited":
      return `El motivo registrado es «${data.typeLabel}». ${festival}`;
    case "resolved":
      return `La infracción por «${data.typeLabel}» fue resuelta. No necesitás realizar ninguna acción.`;
    case "voided":
      return `Anulamos la infracción por «${data.typeLabel}», así que ya no se tendrá en cuenta.`;
  }
}

function infractionKind(
  kind: InfractionEmailKind,
): KindDefinition<InfractionData> {
  const copy = getInfractionEmailCopy(kind);
  return {
    category: "account",
    schema: infractionSchema,
    inApp: (data) => ({
      title: copy.subject,
      body: withNote(infractionBody(kind, data), copy.noteLabel, data.note),
      actionPath: historyPath(data),
      actionLabel: "Ver mi historial",
    }),
    opensDetail: (data) => data.note != null,
    push: true,
    sensitive: true,
  };
}

function sanctionBody(kind: SanctionEmailKind, data: SanctionData) {
  if (kind === "reservation_access_enabled") {
    const festival = data.festivalName ? ` de ${data.festivalName}` : "";
    const from = data.reservationEligibleAt
      ? ` desde el ${formatDisplayDate(data.reservationEligibleAt, DateTime.DATE_MED)} ${atTime(data.reservationEligibleAt)}`
      : "";
    return `El período de espera de tu sanción finalizó. Ya podés acceder a las reservas${festival}${from}.`;
  }
  const current = kind === "approved" || kind === "edited";
  const reasons =
    data.infractionLabels.length === 0
      ? ""
      : data.infractionLabels.length === 1
        ? ` La medida se tomó por el siguiente motivo: ${data.infractionLabels[0]}.`
        : ` La medida se tomó por los siguientes motivos: ${data.infractionLabels.join(", ")}.`;
  return `La sanción ${current ? "consiste" : "consistía"} en ${getSanctionDescription(data.typeLabel)}. ${getSanctionScopeDescription(data.scopeLabel, current)}${reasons}`;
}

function sanctionKind(kind: SanctionEmailKind): KindDefinition<SanctionData> {
  const copy = getSanctionEmailCopy(kind);
  const access = kind === "reservation_access_enabled";
  return {
    // Good news about reserving, so it files with the reservations; the
    // rest stay under "Cuenta", which only "Todas" shows.
    category: access ? "reservations" : "account",
    schema: sanctionSchema,
    inApp: (data) => ({
      title: copy.subject,
      body: access
        ? sanctionBody(kind, data)
        : withNote(sanctionBody(kind, data), copy.noteLabel, data.note),
      ...(access && data.festivalId
        ? {
            actionPath: `/profiles/${data.profileId}/festivals/${data.festivalId}/reservations/new`,
            actionLabel: "Reservar mi espacio",
          }
        : { actionPath: historyPath(data), actionLabel: "Ver mi historial" }),
    }),
    opensDetail: (data) => data.note != null,
    push: true,
    sensitive: true,
  };
}

export const disciplinaryKinds = {
  infraction_registered: infractionKind("registered"),
  infraction_edited: infractionKind("edited"),
  infraction_resolved: infractionKind("resolved"),
  infraction_voided: infractionKind("voided"),
  sanction_approved: sanctionKind("approved"),
  sanction_edited: sanctionKind("edited"),
  sanction_expired: sanctionKind("expired"),
  sanction_revoked: sanctionKind("revoked"),
  sanction_reservation_access_enabled: sanctionKind(
    "reservation_access_enabled",
  ),
} as const;
