import "server-only";

import { eq, inArray } from "drizzle-orm";

import {
  mirrorFailureType,
  type MirrorNotification,
} from "@/app/lib/notifications/mirrors/shared";
import { notify } from "@/app/lib/notifications/notify";
import type { ReservationNotificationKind } from "@/app/lib/reservations/notification-queue";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { db } from "@/db";
import {
  creditTopUps,
  festivals,
  standReservations,
  users,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The inbox half of the reservation outbox (phase 2): every email it queues
 * gets an in-app copy, written in the transaction that queues the email.
 *
 * The email itself is untouched; it still goes out through the outbox, which
 * renders from live data at send time. The inbox item is a snapshot of the
 * moment it was queued.
 */

/** Admin copies land in Administración; everything else is the person's own. */
export type MirrorAudience = "participant" | "admin";

export type ReservationJobToMirror = {
  /** The job just inserted; its id keys the inbox item. */
  jobId: number;
  kind: ReservationNotificationKind;
  reservationId: number | null;
  userId: number;
  payload: Record<string, unknown>;
  audience: MirrorAudience;
};

/** What a reservation looked like inside the transaction that queued the job. */
export type ReservationContext = {
  reservationId: number;
  festivalId: number;
  festivalName: string;
  ownerUserId: number | null;
  /** Whose name the cobro is in: the email's "owner". */
  payerUserId: number | null;
  /** The originally selected half, for a reservation with no members. */
  standLabel: string;
  /** Every member, retired or not, in selection order. */
  members: Array<{
    standId: number;
    position: number;
    releasedAt: Date | null;
    label: string;
  }>;
  /** Display names of the people the copy may name, by user id. */
  names: ReadonlyMap<number, string>;
};

const UNNAMED_PARTICIPANT = "Un participante";
const UNNAMED_PARTNER = "tu compañero";

/** The inbox item for a job, keyed so a person gets one per queued email. */
export function reservationJobDedupeKey(jobId: number) {
  return `reservation-job:${jobId}`;
}

function payloadNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

/** Money: zero and two decimals are fine. */
function payloadAmount(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function payloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function payloadNumberArray(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return Array.isArray(value) &&
    value.every((item) => typeof item === "number" && Number.isInteger(item))
    ? (value as number[])
    : null;
}

function payloadIsoDate(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function displayName(user: {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  return (
    user.displayName?.trim() ||
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
  );
}

function nameOf(
  context: ReservationContext,
  userId: number | null,
  fallback: string,
) {
  return (userId != null && context.names.get(userId)) || fallback;
}

/** "B48 y B49" for the given members, or the parent stand when none match. */
function standsOf(
  context: ReservationContext,
  members: ReservationContext["members"],
) {
  return members.length > 0
    ? {
        standLabel: members.map((member) => member.label).join(" y "),
        standCount: members.length,
      }
    : { standLabel: context.standLabel, standCount: 1 };
}

function reservationRef(
  context: ReservationContext,
  members = context.members.filter((member) => member.releasedAt == null),
) {
  return {
    reservationId: context.reservationId,
    festivalId: context.festivalId,
    festivalName: context.festivalName,
    ...standsOf(context, members),
  };
}

/**
 * The inbox item for one reservation job, or null when it has none.
 *
 * Mirrors what the email does, recipient by recipient. Where the email tells
 * owner and partner apart, so does the item; where the email sends nothing
 * (`settlement_rejected`, which only ever mails a reservation that has since
 * been cancelled), neither does the inbox.
 */
export function buildReservationJobNotification(
  job: ReservationJobToMirror,
  context: ReservationContext,
): MirrorNotification | null {
  const admin = job.audience === "admin";
  const own = { ...reservationRef(context), profileId: job.userId };
  const participantName = nameOf(
    context,
    context.payerUserId,
    UNNAMED_PARTICIPANT,
  );
  const adminRef = { ...reservationRef(context), participantName };

  switch (job.kind) {
    case "reservation_created":
      // Only admins are ever told: the owner is on the screen that made it.
      return admin ? { kind: "reservation_created_admin", data: adminRef } : null;

    case "proof_submitted":
      return admin
        ? { kind: "reservation_proof_submitted_admin", data: adminRef }
        : { kind: "reservation_proof_submitted", data: own };

    case "zero_value_review_requested":
      return admin
        ? {
            kind: "reservation_zero_value_review_requested_admin",
            data: adminRef,
          }
        : { kind: "reservation_zero_value_review_requested", data: own };

    case "settlement_approved":
      // Admins are only queued for this when credits confirmed it alone.
      return admin
        ? { kind: "reservation_confirmed_with_credits_admin", data: adminRef }
        : { kind: "reservation_confirmed", data: own };

    case "settlement_rejected":
      return null;

    case "reservation_rejected":
      if (admin) return null;
      return {
        kind: "reservation_cancelled",
        data: { ...own, reason: payloadText(job.payload, "reason") },
      };

    case "deadline_extended": {
      if (admin) return null;
      const dueAt = payloadIsoDate(job.payload, "dueAt");
      if (!dueAt) return null;
      return {
        kind: "reservation_payment_deadline_extended",
        data: {
          ...own,
          role: job.userId === context.payerUserId ? "owner" : "partner",
          ownerName: participantName,
          dueAt,
        },
      };
    }

    case "reservation_released": {
      if (admin) return null;
      // Every member is retired by now: name what this release freed.
      const releasedStandIds = payloadNumberArray(
        job.payload,
        "releasedStandIds",
      );
      const released = releasedStandIds
        ? context.members.filter((member) =>
            releasedStandIds.includes(member.standId),
          )
        : context.members;
      const ownerId = context.ownerUserId ?? context.payerUserId;
      const isOwner = job.userId === ownerId;
      return {
        kind: "reservation_released",
        data: {
          ...reservationRef(context, released),
          profileId: job.userId,
          role: isOwner ? "owner" : "partner",
          ownerName: nameOf(context, ownerId, UNNAMED_PARTICIPANT),
          creditPrice: isOwner
            ? Math.max(0, payloadAmount(job.payload, "creditPrice") ?? 0)
            : null,
        },
      };
    }

    case "late_partner_added": {
      if (admin) return null;
      const ownerId = context.ownerUserId ?? context.payerUserId;
      const isOwner = job.userId === ownerId;
      return {
        kind: "reservation_partner_added",
        data: {
          ...own,
          role: isOwner ? "owner" : "partner",
          ownerName: nameOf(context, ownerId, UNNAMED_PARTICIPANT),
          partnerName: nameOf(
            context,
            payloadNumber(job.payload, "partnerUserId"),
            UNNAMED_PARTNER,
          ),
          totalCredits: isOwner
            ? Math.max(0, payloadAmount(job.payload, "totalCredits") ?? 0)
            : null,
        },
      };
    }

    // Not about a reservation: see the builders below.
    case "festival_participation_approved":
    case "festival_participation_rejected":
    case "credit_top_up_rejected":
      return null;
  }
}

export function buildParticipationJobNotification(
  job: ReservationJobToMirror,
  festival: { id: number; name: string; reservationsStartDate: Date | null },
  now: Date,
): MirrorNotification | null {
  if (job.audience === "admin") return null;
  if (job.kind === "festival_participation_approved") {
    return {
      kind: "festival_participation_approved",
      data: {
        festivalId: festival.id,
        festivalName: festival.name,
        reservationsStartDate:
          festival.reservationsStartDate?.toISOString() ?? null,
        reservationsOpen:
          !festival.reservationsStartDate ||
          festival.reservationsStartDate <= now,
      },
    };
  }
  if (job.kind === "festival_participation_rejected") {
    return {
      kind: "festival_participation_rejected",
      data: {
        festivalId: festival.id,
        festivalName: festival.name,
        reason: payloadText(job.payload, "reason"),
      },
    };
  }
  return null;
}

export function buildTopUpRejectedJobNotification(
  job: ReservationJobToMirror,
  topUp: { id: number; amount: number; rejectionReason: string | null },
): MirrorNotification | null {
  if (job.audience === "admin" || job.kind !== "credit_top_up_rejected") {
    return null;
  }
  return {
    kind: "credit_top_up_rejected",
    data: {
      topUpId: topUp.id,
      amount: topUp.amount,
      // The same fallback the email uses.
      reason: topUp.rejectionReason?.trim() || "No se indicó un motivo.",
      // As of the rejection, like the email: later spending must not
      // rewrite it.
      debtAmount: Math.max(0, payloadAmount(job.payload, "debtAmount") ?? 0),
    },
  };
}

async function loadReservationContext(
  tx: DbTx,
  reservationId: number,
  extraUserIds: readonly number[],
): Promise<ReservationContext | null> {
  const reservation = await tx.query.standReservations.findFirst({
    where: eq(standReservations.id, reservationId),
    columns: { id: true, festivalId: true, ownerUserId: true },
    with: {
      festival: { columns: { name: true } },
      stand: { columns: { label: true, standNumber: true } },
      members: {
        columns: { standId: true, position: true, releasedAt: true },
        with: { stand: { columns: { label: true, standNumber: true } } },
      },
      invoices: {
        columns: { id: true, status: true, userId: true },
        orderBy: (invoice, { asc }) => [asc(invoice.id)],
      },
    },
  });
  if (!reservation) return null;

  // The same cobro the email reads its "owner" from.
  const invoice =
    reservation.invoices.find((row) => row.status !== "cancelled") ??
    reservation.invoices[0];
  const payerUserId = invoice?.userId ?? reservation.ownerUserId;

  const nameIds = [
    ...new Set(
      [payerUserId, reservation.ownerUserId, ...extraUserIds].filter(
        (id): id is number => id != null,
      ),
    ),
  ];
  const people =
    nameIds.length === 0
      ? []
      : await tx
          .select({
            id: users.id,
            displayName: users.displayName,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(users)
          .where(inArray(users.id, nameIds));

  return {
    reservationId: reservation.id,
    festivalId: reservation.festivalId,
    festivalName: reservation.festival.name,
    ownerUserId: reservation.ownerUserId,
    payerUserId,
    standLabel: formatStandLabel(reservation.stand),
    members: reservation.members
      .map((member) => ({
        standId: member.standId,
        position: member.position,
        releasedAt: member.releasedAt,
        label: formatStandLabel(member.stand),
      }))
      .sort((a, b) => a.position - b.position),
    names: new Map(
      people
        .map((person) => [person.id, displayName(person)] as const)
        .filter(([, name]) => name.length > 0),
    ),
  };
}

async function buildFromTransaction(
  tx: DbTx,
  job: ReservationJobToMirror,
): Promise<MirrorNotification | null> {
  switch (job.kind) {
    case "festival_participation_approved":
    case "festival_participation_rejected": {
      const festivalId = payloadNumber(job.payload, "festivalId");
      if (festivalId == null) return null;
      const [festival] = await tx
        .select({
          id: festivals.id,
          name: festivals.name,
          reservationsStartDate: festivals.reservationsStartDate,
        })
        .from(festivals)
        .where(eq(festivals.id, festivalId))
        .limit(1);
      return festival
        ? buildParticipationJobNotification(job, festival, new Date())
        : null;
    }

    case "credit_top_up_rejected": {
      const topUpId = payloadNumber(job.payload, "topUpId");
      if (topUpId == null) return null;
      const [topUp] = await tx
        .select({
          id: creditTopUps.id,
          amount: creditTopUps.amount,
          rejectionReason: creditTopUps.rejectionReason,
        })
        .from(creditTopUps)
        .where(eq(creditTopUps.id, topUpId))
        .limit(1);
      return topUp
        ? buildTopUpRejectedJobNotification(job, {
            ...topUp,
            amount: Number(topUp.amount),
          })
        : null;
    }

    default: {
      if (job.reservationId == null) return null;
      const partnerUserId = payloadNumber(job.payload, "partnerUserId");
      const context = await loadReservationContext(
        tx,
        job.reservationId,
        partnerUserId != null ? [partnerUserId] : [],
      );
      return context ? buildReservationJobNotification(job, context) : null;
    }
  }
}

/**
 * Writes the inbox copy of a job the caller just queued, inside the caller's
 * transaction, so the two commit or roll back together.
 *
 * It runs in a savepoint and never throws: a snapshot that fails to load or
 * validate costs the inbox item and is logged, but cannot undo a payment
 * approval or a cancellation that the email already reports.
 */
export async function mirrorReservationNotificationJob(
  tx: DbTx,
  job: ReservationJobToMirror,
): Promise<void> {
  try {
    await tx.transaction(async (savepoint) => {
      const built = await buildFromTransaction(savepoint, job);
      if (!built) return;
      await notify(savepoint, {
        userId: job.userId,
        kind: built.kind,
        data: built.data,
        dedupeKey: reservationJobDedupeKey(job.jobId),
      } as Parameters<typeof notify>[1]);
    });
  } catch (error) {
    console.error("[notifications] Inbox copy of a queued email failed", {
      kind: job.kind,
      jobId: job.jobId,
      error: mirrorFailureType(error),
    });
  }
}
