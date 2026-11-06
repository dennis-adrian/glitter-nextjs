import "server-only";

import { and, eq, exists, gt, lte, notExists, sql } from "drizzle-orm";

import { emailBaseUrlProblem, publicBaseUrl } from "@/app/lib/urls";
import {
  festivalCategories,
  invitableParticipant,
} from "@/app/lib/festivals/participant-audience";
import {
  BULK_BATCH_RESERVE_MS,
  hasBatchTime,
  sendBulkEmails,
} from "@/app/lib/notifications/bulk-email";
import { sendBulkPushes } from "@/app/lib/notifications/deliveries";
import type { FestivalReservationsOpenData } from "@/app/lib/notifications/kinds/reservations-open";
import { notifyMany, type NotifyTx } from "@/app/lib/notifications/notify";
import { buildInAppCopy } from "@/app/lib/notifications/registry";
import { db } from "@/db";
import {
  festivalReservationsOpenNotices,
  festivals,
  notificationCampaigns,
  pushSubscriptions,
  users,
} from "@/db/schema";
import { serverEnv } from "@/env";

/**
 * "Reservations are open": the notice on the festival's admin page.
 *
 * The cron sends it once per festival and opening time, shortly after the
 * opening; an admin can send it again from the festival's page. Every send is
 * its own notification campaign, written in one transaction: an inbox item
 * per participant, a bulk-lane email row for each, and a bulk push per device
 * with avisos on. The send's own run delivers what it can right away; the
 * comunicados cron (bulk email) and the notifications cron (bulk push) take
 * whatever it leaves.
 *
 * Who it reaches: verified participants (role `user`) who can reserve in
 * the festival (`invitableParticipant`, the activation's audience), minus
 * anyone who already holds a live reservation in it.
 */

export const RESERVATIONS_OPEN_KIND = "festival_reservations_open" as const;

/**
 * How late the cron still sends the automatic notice. A festival activated,
 * or a date moved into the past, within this window still gets it; one whose
 * reservations opened before is left alone, so a deploy never announces
 * openings from long ago.
 */
export const AUTOMATIC_WINDOW_MS = 24 * 60 * 60 * 1000;

/** First key of the per-festival send lock; distinct from the other lanes'. */
const NOTICE_LOCK_NAMESPACE = 8155;

/** Reservation statuses that mean someone already has a place. */
const LIVE_RESERVATION = sql`('pending', 'verification_payment', 'accepted')`;

/** The longest a send's own run spends on pushes before its email. */
const PUSH_STEP_MAX_MS = 20_000;

export function reservationsOpenDedupeKey(campaignId: number) {
  return `festival-reservations-open:${campaignId}`;
}

/** Not already holding a live reservation in the festival, as owner or member. */
function withoutLiveReservation(festivalId: number) {
  return sql`NOT EXISTS (
    SELECT 1 FROM stand_reservations r
    WHERE r.festival_id = ${festivalId}::int
      AND r.status IN ${LIVE_RESERVATION}
      AND (
        r.owner_user_id = ${users.id}
        OR EXISTS (
          SELECT 1 FROM participations p
          WHERE p.reservation_id = r.id AND p.user_id = ${users.id}
        )
      )
  )`;
}

async function audienceWhere(festivalId: number) {
  const categories = await festivalCategories(festivalId);
  if (categories.length === 0) return null;
  return and(
    // Participants only: staff with a profile category are not told.
    eq(users.role, "user"),
    invitableParticipant(categories),
    withoutLiveReservation(festivalId),
  );
}

const hasDevice = exists(
  db
    .select({ one: sql`1` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, users.id)),
);

export type ReservationsOpenAudience = {
  recipients: number;
  withPush: number;
};

/** How many people a send would reach now, and how many have a device. */
export async function countReservationsOpenAudience(
  festivalId: number,
): Promise<ReservationsOpenAudience> {
  const where = await audienceWhere(festivalId);
  if (!where) return { recipients: 0, withPush: 0 };
  const [row] = await db
    .select({
      recipients: sql<number>`count(*)`.mapWith(Number),
      withPush: sql<number>`count(*) filter (where ${hasDevice})`.mapWith(
        Number,
      ),
    })
    .from(users)
    .where(where);
  return { recipients: row?.recipients ?? 0, withPush: row?.withPush ?? 0 };
}

async function audienceUserIds(tx: NotifyTx, festivalId: number) {
  const where = await audienceWhere(festivalId);
  if (!where) return [];
  const rows = await tx.select({ id: users.id }).from(users).where(where);
  return rows.map((row) => row.id);
}

export type CreateNoticeResult =
  | {
      kind: "sent";
      campaignId: number;
      recipients: number;
      emails: number;
      pushes: number;
    }
  | { kind: "not_found" }
  | { kind: "inactive" }
  | { kind: "not_open" }
  /** Automatic only: this opening already has a notice. */
  | { kind: "already_sent" }
  /** The same request id sent before (a double submit). */
  | { kind: "duplicate"; campaignId: number | null };

/**
 * Writes one notice and everything it delivers, in one transaction. Nothing
 * is sent here: pass the campaign to `deliverReservationsOpenNotice` once
 * this returns.
 *
 * Sends are serialized per festival, so two cron runs, or a run and a resend,
 * never both pass the "already sent" check.
 */
export async function createReservationsOpenNotice(
  input: {
    festivalId: number;
    now: Date;
  } & (
    | { trigger: "automatic" }
    | {
        trigger: "manual";
        /** Minted per confirm click, so a double submit is one send. */
        requestId: string;
        actorUserId: number;
      }
  ),
): Promise<CreateNoticeResult> {
  const actorUserId = input.trigger === "manual" ? input.actorUserId : null;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${NOTICE_LOCK_NAMESPACE}, ${input.festivalId}::int)`,
    );
    const [festival] = await tx
      .select({
        id: festivals.id,
        name: festivals.name,
        status: festivals.status,
        reservationsStartDate: festivals.reservationsStartDate,
      })
      .from(festivals)
      .where(eq(festivals.id, input.festivalId));
    if (!festival) return { kind: "not_found" };
    if (festival.status !== "active") return { kind: "inactive" };
    if (festival.reservationsStartDate.getTime() > input.now.getTime()) {
      return { kind: "not_open" };
    }

    if (input.trigger === "automatic") {
      // Any notice for this opening counts: one an admin sent right after
      // it is not repeated by the cron minutes later.
      const [existing] = await tx
        .select({ campaignId: festivalReservationsOpenNotices.campaignId })
        .from(festivalReservationsOpenNotices)
        .where(
          and(
            eq(festivalReservationsOpenNotices.festivalId, festival.id),
            eq(
              festivalReservationsOpenNotices.reservationsStartDate,
              festival.reservationsStartDate,
            ),
          ),
        )
        .limit(1);
      if (existing) return { kind: "already_sent" };
    }

    const idempotencyKey =
      input.trigger === "manual"
        ? `reservations-open:manual:${input.requestId}`
        : `reservations-open:auto:${festival.id}:${festival.reservationsStartDate.toISOString()}`;
    const data: FestivalReservationsOpenData = {
      festivalId: festival.id,
      festivalName: festival.name,
    };
    const copy = buildInAppCopy(RESERVATIONS_OPEN_KIND, data);
    const [campaign] = await tx
      .insert(notificationCampaigns)
      .values({
        type: "reservations_open",
        // Everything is written below, in this transaction.
        status: "completed",
        completedAt: input.now,
        title: copy.title,
        message: copy.body,
        createdByUserId: actorUserId,
        idempotencyKey,
      })
      .onConflictDoNothing({ target: notificationCampaigns.idempotencyKey })
      .returning({ id: notificationCampaigns.id });
    if (!campaign) {
      const [previous] = await tx
        .select({ id: notificationCampaigns.id })
        .from(notificationCampaigns)
        .where(eq(notificationCampaigns.idempotencyKey, idempotencyKey));
      return { kind: "duplicate", campaignId: previous?.id ?? null };
    }

    const result = await notifyMany(tx, {
      kind: RESERVATIONS_OPEN_KIND,
      data,
      userIds: await audienceUserIds(tx, festival.id),
      dedupeKey: reservationsOpenDedupeKey(campaign.id),
      campaignId: campaign.id,
      email: "bulk",
    });

    const counts = {
      recipients: result.createdUserIds.length,
      emails: result.emailDeliveryIds.length,
      pushes: result.pushDeliveryIds.length,
    };
    await tx.insert(festivalReservationsOpenNotices).values({
      campaignId: campaign.id,
      festivalId: festival.id,
      trigger: input.trigger,
      reservationsStartDate: festival.reservationsStartDate,
      env: serverEnv.VERCEL_ENV,
      createdByUserId: actorUserId,
      ...counts,
    });
    return { kind: "sent", campaignId: campaign.id, ...counts };
  });
}

export type DeliverNoticeRun = {
  pushes: Awaited<ReturnType<typeof sendBulkPushes>> | null;
  email: Awaited<ReturnType<typeof sendBulkEmails>> | null;
  emailSkipped: "base_url" | "deadline" | null;
};

/**
 * Sends one notice's pushes, then its email, until `deadline`. Whatever is
 * left is the crons'. Errors are thrown for the caller to log.
 */
export async function deliverReservationsOpenNotice(
  campaignId: number,
  { deadline }: { deadline: number },
): Promise<DeliverNoticeRun> {
  const run: DeliverNoticeRun = {
    pushes: null,
    email: null,
    emailSkipped: null,
  };
  const pushBudgetMs = Math.max(
    0,
    Math.min(PUSH_STEP_MAX_MS, deadline - Date.now()),
  );
  if (pushBudgetMs > 0) {
    run.pushes = await sendBulkPushes({ campaignId, budgetMs: pushBudgetMs });
  }

  const problem = emailBaseUrlProblem(publicBaseUrl(), serverEnv.VERCEL_ENV);
  if (problem) {
    // Its links would not work: the email waits until the URL is fixed.
    console.error("[reservations-open] email skipped:", problem);
    run.emailSkipped = "base_url";
  } else if (!hasBatchTime(deadline, Date.now(), BULK_BATCH_RESERVE_MS)) {
    run.emailSkipped = "deadline";
  } else {
    run.email = await sendBulkEmails({ campaignId, deadline });
  }
  return run;
}

/** Active festivals whose reservations opened inside the window, unannounced. */
export async function findFestivalsDueForReservationsOpenNotice(now: Date) {
  return db
    .select({ id: festivals.id })
    .from(festivals)
    .where(
      and(
        eq(festivals.status, "active"),
        lte(festivals.reservationsStartDate, now),
        gt(
          festivals.reservationsStartDate,
          new Date(now.getTime() - AUTOMATIC_WINDOW_MS),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(festivalReservationsOpenNotices)
            .where(
              and(
                eq(festivalReservationsOpenNotices.festivalId, festivals.id),
                eq(
                  festivalReservationsOpenNotices.reservationsStartDate,
                  festivals.reservationsStartDate,
                ),
              ),
            ),
        ),
      ),
    )
    .orderBy(festivals.reservationsStartDate);
}

export type AutomaticNoticesRun = {
  due: number;
  sent: { festivalId: number; campaignId: number; recipients: number }[];
  failed: number;
};

/**
 * The cron's pass: the automatic notice for every festival whose
 * reservations just opened, each delivered as far as the deadline allows.
 */
export async function sendDueReservationsOpenNotices({
  deadline,
  now = () => new Date(),
}: {
  deadline: number;
  now?: () => Date;
}): Promise<AutomaticNoticesRun> {
  const due = await findFestivalsDueForReservationsOpenNotice(now());
  const run: AutomaticNoticesRun = { due: due.length, sent: [], failed: 0 };
  for (const festival of due) {
    try {
      const result = await createReservationsOpenNotice({
        festivalId: festival.id,
        trigger: "automatic",
        now: now(),
      });
      if (result.kind !== "sent") continue;
      run.sent.push({
        festivalId: festival.id,
        campaignId: result.campaignId,
        recipients: result.recipients,
      });
      if (Date.now() < deadline) {
        await deliverReservationsOpenNotice(result.campaignId, { deadline });
      }
    } catch (error) {
      run.failed += 1;
      // The type only: a query error's message carries its params.
      console.error("[reservations-open] automatic notice failed", {
        festivalId: festival.id,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
  }
  return run;
}

export type ReservationsOpenNoticeSummary = {
  campaignId: number;
  trigger: "automatic" | "manual";
  createdAt: Date;
  sentByName: string | null;
  recipients: number;
  emails: number;
  emailsSent: number;
  pushes: number;
  pushesSent: number;
};

/** A festival's notices, newest first, with how far their delivery got. */
export async function fetchReservationsOpenNotices(
  festivalId: number,
  limit = 10,
): Promise<ReservationsOpenNoticeSummary[]> {
  const { rows } = await db.execute<{
    campaign_id: number;
    trigger: "automatic" | "manual";
    created_at: Date | string;
    sent_by: string | null;
    recipients: number;
    emails: number;
    pushes: number;
    emails_sent: number | string;
    pushes_sent: number | string;
  }>(sql`
    SELECT o.campaign_id, o.trigger, o.created_at, o.recipients, o.emails,
      o.pushes,
      coalesce(nullif(btrim(u.display_name), ''),
        nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '')) AS sent_by,
      (SELECT count(*) FROM notification_deliveries d
        JOIN notifications n ON n.id = d.notification_id
        WHERE n.campaign_id = o.campaign_id AND d.channel = 'email'
          AND d.status = 'sent') AS emails_sent,
      (SELECT count(*) FROM notification_deliveries d
        JOIN notifications n ON n.id = d.notification_id
        WHERE n.campaign_id = o.campaign_id AND d.channel = 'push'
          AND d.status = 'sent') AS pushes_sent
    FROM festival_reservations_open_notices o
    LEFT JOIN users u ON u.id = o.created_by_user_id
    WHERE o.festival_id = ${festivalId}::int
    ORDER BY o.created_at DESC, o.campaign_id DESC
    LIMIT ${limit}::int
  `);
  return rows.map((row) => ({
    campaignId: Number(row.campaign_id),
    trigger: row.trigger,
    createdAt: new Date(row.created_at),
    sentByName: row.sent_by,
    recipients: Number(row.recipients),
    emails: Number(row.emails),
    emailsSent: Number(row.emails_sent),
    pushes: Number(row.pushes),
    pushesSent: Number(row.pushes_sent),
  }));
}
