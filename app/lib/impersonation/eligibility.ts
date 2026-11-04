import type { BaseProfile } from "@/app/api/users/definitions";
import {
  IMPERSONATABLE_ROLES,
  type ImpersonationRefusal,
} from "@/app/lib/impersonation/definitions";

type Person = Pick<BaseProfile, "id" | "role">;

/**
 * Whether a profile is the kind that can be viewed as: a participant, in any
 * status. Pending, paused, rejected and banned accounts are exactly the ones
 * support questions are about, so none of them is left out. For deciding
 * whether to offer the entry point; `impersonationRefusal` is the full check.
 */
export function canBeImpersonated(
  subject: Pick<BaseProfile, "role"> | null | undefined,
): boolean {
  return (
    subject != null &&
    (IMPERSONATABLE_ROLES as readonly string[]).includes(subject.role)
  );
}

/**
 * Why `actor` may not start viewing the app as `subject`, or null when they
 * may. Pure, so every rule is tested on its own; the start action loads the
 * inputs and calls it.
 *
 * - Only a global admin, never a festival admin or a participant.
 * - Not while already viewing as someone: the actor would be the participant.
 * - Never yourself, never a staff account, only participants.
 * - Not an account on its way out (a pending deletion).
 */
export function impersonationRefusal({
  actor,
  actorIsViewing,
  subject,
  subjectPendingDeletion,
}: {
  /** The signed-in person themself, never whoever they are viewing as. */
  actor: Person | null | undefined;
  actorIsViewing: boolean;
  subject: Person | null | undefined;
  subjectPendingDeletion: boolean;
}): ImpersonationRefusal | null {
  if (!actor || actor.role !== "admin") return "not_admin";
  if (actorIsViewing) return "already_viewing";
  if (!subject) return "not_found";
  if (subject.id === actor.id) return "self";
  if (subject.role === "admin" || subject.role === "festival_admin") {
    return "staff";
  }
  if (!canBeImpersonated(subject)) return "not_participant";
  if (subjectPendingDeletion) return "deleting";
  return null;
}
