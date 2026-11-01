import { PARTICIPANT_READ_ONLY_ROUTE_STATUSES } from "@/app/lib/participants/definitions";

/**
 * Why someone cannot receive what admins send participants: a credit gift, a
 * comunicado, a place on a saved list's count. One rule, so a list counts the
 * same people a gift or a comunicado would reach.
 */
export const PARTICIPANT_SKIP_REASONS = {
  not_participant: "No es participante",
  not_verified: "Perfil no verificado",
  banned: "Cuenta suspendida",
  deletion_pending: "Cuenta en eliminación",
} as const;
export type ParticipantSkipReason = keyof typeof PARTICIPANT_SKIP_REASONS;

const RECEIVING_STATUSES: readonly string[] =
  PARTICIPANT_READ_ONLY_ROUTE_STATUSES;

/**
 * Who can receive it: a participant whose wallet and portal are open, the
 * statuses `/my_credits` lets in. A pending profile deletion is checked
 * separately, since it lives in another table.
 */
export function participantSkipReason(recipient: {
  role: string;
  status: string;
}): ParticipantSkipReason | null {
  if (recipient.role !== "user") return "not_participant";
  if (recipient.status === "banned") return "banned";
  if (!RECEIVING_STATUSES.includes(recipient.status)) return "not_verified";
  return null;
}
