import type { ReservationErrorCode } from "@/app/lib/reservations/errors";
import {
  blocksFestivalParticipation,
  occupiesStandCapacity,
} from "@/app/lib/reservations/policy";
import { reservationStatusLabel } from "@/app/lib/reservations/status-labels";

/**
 * Moving one participation from an account its owner lost to the account they
 * use now. The rules live here, apart from the database, so the preview the
 * admin confirms and the command that writes are judged by the same function.
 *
 * What moves is everything that says "this person is on this reservation": the
 * participation row (and with it the stamp and the products sent for it), the
 * festival enrollment when the old account has no other use for it, the cobros
 * billed to it and their payment reminders, and — when the old account held
 * the reservation — its ownership.
 *
 * What stays is what records something the old account did: credits spent from
 * its wallet, payment proofs it uploaded, infractions and sanctions, activity
 * sign-ups. Those are facts about that account, and the ledger in particular
 * is append-only by design; credits handed back later return to the wallet
 * they left, which the warnings say before anyone confirms.
 */

export type TransferTarget = {
  id: number;
  role: string;
  status: string;
};

export type TransferEnrollment = { id: number; status: string } | null;

export type TransferEnrollmentPlan =
  /** The target already has one; neither is touched. */
  | "keep"
  /** The old account's enrollment moves with the participation. */
  | "move"
  /** The old account still needs its own, so the target gets a copy. */
  | "copy"
  /** Neither account has one (a legacy or admin-assigned reservation). */
  | "none";

export type TransferSnapshot = {
  fromUserId: number;
  toUserId: number;
  reservation: { status: string; festivalStatus: string };
  participantUserIds: readonly number[];
  /** Owner, or the legacy fallback: see `reservationHolderId`. */
  holderUserId: number | null;
  target: TransferTarget | null;
  /** Another live reservation of the target in the same festival. */
  targetHasLiveReservationInFestival: boolean;
  /** Only read for a live reservation; history is not re-judged. */
  targetSanctionBlocked: boolean;
  /** Paid features of this reservation whose credits are still on hold. */
  activeFeatureActionCount: number;
  /** Credits from the old account's wallet applied to this reservation. */
  creditsAppliedFromSource: number;
  /** The old account's sign-ups to this festival's activities, which stay. */
  sourceActivitySignups: number;
  enrollment: {
    from: TransferEnrollment;
    to: TransferEnrollment;
    /** The old account takes part in this festival through another reservation. */
    fromHasOtherParticipationInFestival: boolean;
  };
  /** The old account's rows on this reservation, so the dialog can name them. */
  counts: {
    invoices: number;
    scheduledTasks: number;
    products: number;
  };
};

export type TransferPlan = {
  /** Whether the reservation's ownership goes along with the participation. */
  movesHolding: boolean;
  enrollment: TransferEnrollmentPlan;
  /** Plain sentences for the admin: what this will carry. */
  moves: string[];
  /** Consequences that do not stop the transfer but deserve a second look. */
  warnings: string[];
};

export type TransferDecision =
  | { ok: true; plan: TransferPlan }
  | { ok: false; code: ReservationErrorCode };

/**
 * A reservation that still holds a stand in a festival that is not over, so
 * its target has to be able to hold one today. A past festival's reservations
 * stay `accepted` for good once it is archived; those are history, which is
 * what this feature mostly moves, and are not re-judged.
 */
export function isLiveTransfer(reservation: {
  status: string;
  festivalStatus: string;
}): boolean {
  return (
    reservation.festivalStatus !== "archived" &&
    occupiesStandCapacity(reservation.status)
  );
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function planEnrollment(
  enrollment: TransferSnapshot["enrollment"],
): TransferEnrollmentPlan {
  if (enrollment.to) return "keep";
  if (!enrollment.from) return "none";
  return enrollment.fromHasOtherParticipationInFestival ? "copy" : "move";
}

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  pending: "pendiente",
  accepted: "aceptada",
  rejected: "rechazada",
};

export function decideParticipantTransfer(
  snapshot: TransferSnapshot,
): TransferDecision {
  if (snapshot.fromUserId === snapshot.toUserId) {
    return { ok: false, code: "TRANSFER_SAME_ACCOUNT" };
  }
  if (!snapshot.participantUserIds.includes(snapshot.fromUserId)) {
    return { ok: false, code: "TRANSFER_NOT_PARTICIPANT" };
  }
  if (!snapshot.target) {
    return { ok: false, code: "TRANSFER_TARGET_NOT_FOUND" };
  }
  if (snapshot.participantUserIds.includes(snapshot.toUserId)) {
    return { ok: false, code: "TRANSFER_TARGET_ALREADY_PARTICIPANT" };
  }

  const live = isLiveTransfer(snapshot.reservation);
  // Participants are `user` accounts; an admin account holding a stand would
  // drop out of every participant list. A live reservation needs somebody who
  // can take part today; history can also land on a paused account, which is
  // still the same person, just resting.
  const allowedStatuses = live ? ["verified"] : ["verified", "paused"];
  if (
    snapshot.target.role !== "user" ||
    !allowedStatuses.includes(snapshot.target.status)
  ) {
    return { ok: false, code: "TRANSFER_TARGET_NOT_ELIGIBLE" };
  }

  if (live) {
    if (snapshot.targetHasLiveReservationInFestival) {
      return { ok: false, code: "TRANSFER_TARGET_ALREADY_RESERVED" };
    }
    if (snapshot.targetSanctionBlocked) {
      return { ok: false, code: "SANCTION_BLOCKED" };
    }
    if (snapshot.activeFeatureActionCount > 0) {
      return { ok: false, code: "TRANSFER_FEATURE_ACTIVE" };
    }
    if (snapshot.creditsAppliedFromSource > 0) {
      return { ok: false, code: "TRANSFER_CREDITS_APPLIED" };
    }
  }

  const movesHolding = snapshot.holderUserId === snapshot.fromUserId;
  const enrollment = planEnrollment(snapshot.enrollment);

  const moves = ["La participación en la reserva"];
  if (movesHolding) moves.push("La titularidad de la reserva");
  if (snapshot.counts.invoices > 0) {
    moves.push(
      `${plural(snapshot.counts.invoices, "cobro", "cobros")} a su nombre`,
    );
  }
  if (snapshot.counts.scheduledTasks > 0) {
    moves.push("Los recordatorios de pago");
  }
  if (snapshot.counts.products > 0) {
    moves.push(
      plural(
        snapshot.counts.products,
        "producto enviado para el festival",
        "productos enviados para el festival",
      ),
    );
  }
  if (enrollment === "move") moves.push("La inscripción al festival");
  if (enrollment === "copy") {
    moves.push(
      "Una copia de la inscripción al festival (la cuenta de origen tiene otra reserva ahí)",
    );
  }

  const warnings: string[] = [];
  // Only reachable for a closed reservation: a live one with credits on it
  // was refused above.
  if (snapshot.creditsAppliedFromSource > 0) {
    warnings.push(
      `Los Bs${snapshot.creditsAppliedFromSource} en créditos aplicados al cobro quedan registrados en la billetera de la cuenta de origen: si alguna vez se devuelven, vuelven a esa billetera.`,
    );
  }
  if (
    snapshot.reservation.festivalStatus === "active" &&
    blocksFestivalParticipation(snapshot.reservation.status)
  ) {
    warnings.push(
      `Esta reserva está ${reservationStatusLabel(snapshot.reservation.status).toLowerCase()}: al transferirla, la cuenta de destino tampoco va a poder reservar en este festival.`,
    );
  }
  if (
    live &&
    snapshot.enrollment.to &&
    snapshot.enrollment.to.status !== "accepted"
  ) {
    warnings.push(
      `La cuenta de destino tiene su solicitud para este festival ${
        ENROLLMENT_STATUS_LABELS[snapshot.enrollment.to.status] ??
        snapshot.enrollment.to.status
      }, y no se modifica.`,
    );
  }

  if (snapshot.sourceActivitySignups > 0) {
    warnings.push(
      `La cuenta de origen está inscrita en ${plural(
        snapshot.sourceActivitySignups,
        "actividad",
        "actividades",
      )} de este festival. Esas inscripciones no se mueven.`,
    );
  }

  return { ok: true, plan: { movesHolding, enrollment, moves, warnings } };
}
