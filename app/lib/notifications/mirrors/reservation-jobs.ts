import "server-only";

import { eq } from "drizzle-orm";

import {
  mirrorFailureType,
  type MirrorNotification,
} from "@/app/lib/notifications/mirrors/shared";
import { notify } from "@/app/lib/notifications/notify";
import type { ReservationNotificationKind } from "@/app/lib/reservations/notification-queue";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { db } from "@/db";
import { creditTopUps, festivals, standReservations } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The inbox half of the reservation outbox (phase 2): every email it queues
 * gets an in-app copy, written in the transaction that queues it.
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
  /**
   * Who did what the email reports. An admin is not told, in their own
   * inbox, about something they just did.
   */
  actorUserId?: number | null;
};

/** What a reservation looked like inside the transaction that queued the job. */
export type ReservationContext = {
  reservationId: number;
  festivalId: number;
  festivalName: string;
  locationLabel: string | null;
  /** When the festival's first day starts, if it has dates. */
  startsAt: Date | null;
  /** Who booked it: the owner's voice in a release or a late partner. */
  ownerUserId: number | null;
  /**
   * Whose name the cobro is in (the first live invoice's user): the email's
   * "owner" for payments, deadlines and the admin copies.
   */
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

/**
 * Reasons the code fills in when no admin typed one. The email still shows
 * them; the inbox does not present them as a reason worth opening.
 */
const PLACEHOLDER_REASONS = new Set([
  "Actualización administrativa",
  "Cancelado desde el estado de pago",
  "Revisión administrativa",
]);

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
  const own = { ...reservationRef(context), profileId: job.userId };
  const participantName = nameOf(
    context,
    context.payerUserId,
    UNNAMED_PARTICIPANT,
  );

  if (job.audience === "admin") {
    // Their own reservation or their own click: an admin who pays their own
    // cobro already has the participant's copy, and one who assigns stands
    // does not need a badge per stand.
    if (job.userId === context.payerUserId || job.userId === job.actorUserId) {
      return null;
    }
    const data = { ...reservationRef(context), participantName };
    switch (job.kind) {
      case "reservation_created":
        return { kind: "reservation_created_admin", data };
      case "proof_submitted":
        return { kind: "reservation_proof_submitted_admin", data };
      case "zero_value_review_requested":
        return { kind: "reservation_zero_value_review_requested_admin", data };
      // Admins are only queued for this when credits confirmed it alone.
      case "settlement_approved":
        return { kind: "reservation_confirmed_with_credits_admin", data };
      default:
        return null;
    }
  }

  switch (job.kind) {
    // Only admins are ever told: the owner is on the screen that made it.
    case "reservation_created":
      return null;

    case "proof_submitted":
      return { kind: "reservation_proof_submitted", data: own };

    case "zero_value_review_requested":
      return { kind: "reservation_zero_value_review_requested", data: own };

    case "settlement_approved":
      return {
        kind: "reservation_confirmed",
        data: {
          ...own,
          startsAt: context.startsAt?.toISOString() ?? null,
          locationLabel: context.locationLabel,
        },
      };

    case "settlement_rejected":
      return null;

    case "reservation_rejected": {
      const reason = payloadText(job.payload, "reason");
      return {
        kind: "reservation_cancelled",
        data: {
          ...own,
          reason: reason && !PLACEHOLDER_REASONS.has(reason) ? reason : null,
        },
      };
    }

    case "deadline_extended": {
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

const NAME_COLUMNS = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
} as const;

/** One statement: the reservation, its festival, stands, cobros and people. */
async function loadReservationContext(
  tx: DbTx,
  reservationId: number,
): Promise<ReservationContext | null> {
  const reservation = await tx.query.standReservations.findFirst({
    where: eq(standReservations.id, reservationId),
    columns: { id: true, festivalId: true, ownerUserId: true },
    with: {
      festival: {
        columns: { name: true, locationLabel: true },
        with: {
          festivalDates: {
            columns: { startDate: true },
            orderBy: (date, { asc }) => [asc(date.startDate)],
            limit: 1,
          },
        },
      },
      stand: { columns: { label: true, standNumber: true } },
      owner: { columns: NAME_COLUMNS },
      members: {
        columns: { standId: true, position: true, releasedAt: true },
        with: { stand: { columns: { label: true, standNumber: true } } },
      },
      participants: {
        columns: { userId: true },
        with: { user: { columns: NAME_COLUMNS } },
      },
      invoices: {
        columns: { id: true, status: true, userId: true },
        orderBy: (invoice, { asc }) => [asc(invoice.id)],
        with: { user: { columns: NAME_COLUMNS } },
      },
    },
  });
  if (!reservation) return null;

  // The same cobro the email reads its "owner" from.
  const invoice =
    reservation.invoices.find((row) => row.status !== "cancelled") ??
    reservation.invoices[0];

  const people = [
    reservation.owner,
    ...reservation.participants.map((participant) => participant.user),
    ...reservation.invoices.map((row) => row.user),
  ].filter((person): person is NonNullable<typeof person> => person != null);

  return {
    reservationId: reservation.id,
    festivalId: reservation.festivalId,
    festivalName: reservation.festival.name,
    locationLabel: reservation.festival.locationLabel?.trim() || null,
    startsAt: reservation.festival.festivalDates[0]?.startDate ?? null,
    ownerUserId: reservation.ownerUserId,
    payerUserId: invoice?.userId ?? reservation.ownerUserId,
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

/** Reads shared by every job of one batch, which is one event. */
type BatchReads = Map<string, Promise<unknown>>;

function readOnce<T>(reads: BatchReads, key: string, load: () => Promise<T>) {
  let read = reads.get(key) as Promise<T> | undefined;
  if (!read) {
    read = load();
    reads.set(key, read);
  }
  return read;
}

async function buildFromTransaction(
  tx: DbTx,
  job: ReservationJobToMirror,
  reads: BatchReads,
): Promise<MirrorNotification | null> {
  switch (job.kind) {
    case "festival_participation_approved":
    case "festival_participation_rejected": {
      const festivalId = payloadNumber(job.payload, "festivalId");
      if (festivalId == null) return null;
      const [festival] = await readOnce(reads, `festival:${festivalId}`, () =>
        tx
          .select({
            id: festivals.id,
            name: festivals.name,
            reservationsStartDate: festivals.reservationsStartDate,
          })
          .from(festivals)
          .where(eq(festivals.id, festivalId))
          .limit(1),
      );
      return festival
        ? buildParticipationJobNotification(job, festival, new Date())
        : null;
    }

    case "credit_top_up_rejected": {
      const topUpId = payloadNumber(job.payload, "topUpId");
      if (topUpId == null) return null;
      const [topUp] = await readOnce(reads, `top-up:${topUpId}`, () =>
        tx
          .select({
            id: creditTopUps.id,
            amount: creditTopUps.amount,
            rejectionReason: creditTopUps.rejectionReason,
          })
          .from(creditTopUps)
          .where(eq(creditTopUps.id, topUpId))
          .limit(1),
      );
      return topUp
        ? buildTopUpRejectedJobNotification(job, {
            ...topUp,
            amount: Number(topUp.amount),
          })
        : null;
    }

    default: {
      const reservationId = job.reservationId;
      if (reservationId == null) return null;
      const context = await readOnce(
        reads,
        `reservation:${reservationId}`,
        () => loadReservationContext(tx, reservationId),
      );
      return context ? buildReservationJobNotification(job, context) : null;
    }
  }
}

/**
 * Writes the inbox copies of jobs the caller just queued for one event
 * (an owner and every admin, or every participant), inside the caller's
 * transaction, so they commit or roll back with it.
 *
 * One savepoint and one read of the reservation for the whole batch: this
 * runs while the transaction holds the lock that serialises reservation
 * writes, so a copy per admin must not mean a round of reads per admin.
 *
 * It never throws: a snapshot that fails to load or validate costs the
 * batch's inbox items and is logged, but cannot undo a payment approval or a
 * cancellation that the email already reports. Savepoints are named by depth,
 * so never run two of these at once on one transaction.
 */
export async function mirrorReservationNotificationJobs(
  tx: DbTx,
  jobs: readonly ReservationJobToMirror[],
): Promise<void> {
  if (jobs.length === 0) return;
  try {
    await tx.transaction(async (savepoint) => {
      const reads: BatchReads = new Map();
      for (const job of jobs) {
        const built = await buildFromTransaction(savepoint, job, reads);
        if (!built) continue;
        await notify(savepoint, {
          userId: job.userId,
          kind: built.kind,
          data: built.data,
          dedupeKey: reservationJobDedupeKey(job.jobId),
        } as Parameters<typeof notify>[1]);
      }
    });
  } catch (error) {
    console.error("[notifications] Inbox copy of a queued email failed", {
      kinds: [...new Set(jobs.map((job) => job.kind))],
      jobIds: jobs.map((job) => job.jobId),
      error: mirrorFailureType(error),
    });
  }
}
