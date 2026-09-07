import type { FestivalBase } from "@/app/lib/festivals/definitions";

export function isFestivalParticipantTermsEnabled(
  festival: Pick<FestivalBase, "participantTermsEnabled">,
): boolean {
  return festival.participantTermsEnabled;
}

export const FESTIVAL_PARTICIPANT_TERMS_DISABLED_MESSAGE =
  "Los términos y condiciones para este festival no están disponibles todavía.";
