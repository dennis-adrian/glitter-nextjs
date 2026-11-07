import "server-only";

import { and, eq, exists, gt, lte, notExists, sql } from "drizzle-orm";

import { emailBaseUrlProblem, publicBaseUrl } from "@/app/lib/urls";
import {
  AUTOMATIC_WINDOW_MS,
  type ReservationsOpenChannels,
  reservationsOpenChannelsProblem,
} from "@/app/lib/festivals/reservations-open-definitions";
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
 * The cron sends it once per festival and opening time, within an hour of
 * the opening, when the festival has it switched on (the default); an admin
 * can send it again from the same section of the festival's page. The
 * festival's settings choose the channels: email, the in-app item, and a
 * push to devices with avisos on (only with the in-app item, which it opens).
 *
 * Every send is its own notification campaign, written in one transaction:
 * an inbox item per participant when in-app is on, a bulk-lane email row for
 * each (tied to the item, or straight to the campaign when there is none),
 * and a bulk push per device. The send's own run delivers what it can right
 * away; the comunicados cron (bulk email) and the notifications cron (bulk
 * push) take whatever it leaves.
 *
 * Who it reaches: verified participants (role `user`) who can reserve in
 * the festival (`invitableParticipant`, the activation's audience), minus
 * anyone who already holds a live reservation in it.
 */

export const RESERVATIONS_OPEN_KIND = "festival_reservations_open" as const;

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
  | { kind: "invalid_channels"; message: string }
  /** Automatic only: the festival has the automatic notice switched off. */
  | { kind: "disabled" }
  /** Automatic only: the opening is older than the window. */
  | { kind: "too_late" }
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
        /** Chosen in the resend dialog; the festival's settings by default. */
        channels: ReservationsOpenChannels;
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
        auto: festivals.reservationsOpenNoticeAuto,
        email: festivals.reservationsOpenNoticeEmail,
        inApp: festivals.reservationsOpenNoticeInApp,
        push: festivals.reservationsOpenNoticePush,
      })
      .from(festivals)
      .where(eq(festivals.id, input.festivalId));
    if (!festival) return { kind: "not_found" };
    if (festival.status !== "active") return { kind: "inactive" };
    const openedAt = festival.reservationsStartDate.getTime();
    if (openedAt > input.now.getTime()) {
      return { kind: "not_open" };
    }
    const channels: ReservationsOpenChannels =
      input.trigger === "manual"
        ? input.channels
        : { email: festival.email, inApp: festival.inApp, push: festival.push };
    const problem = reservationsOpenChannelsProblem(channels);
    if (problem) return { kind: "invalid_channels", message: problem };

    if (input.trigger === "automatic") {
      if (!festival.auto) return { kind: "disabled" };
      if (input.now.getTime() - openedAt > AUTOMATIC_WINDOW_MS) {
        return { kind: "too_late" };
      }
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

    const userIds = await audienceUserIds(tx, festival.id);
    let counts: { recipients: number; emails: number; pushes: number };
    if (channels.inApp) {
      const result = await notifyMany(tx, {
        kind: RESERVATIONS_OPEN_KIND,
        data,
        userIds,
        dedupeKey: reservationsOpenDedupeKey(campaign.id),
        campaignId: campaign.id,
        email: channels.email ? "bulk" : null,
        push: channels.push,
      });
      counts = {
        recipients: result.createdUserIds.length,
        emails: result.emailDeliveryIds.length,
        pushes: result.pushDeliveryIds.length,
      };
    } else {
      const emails = await queueEmailOnly(tx, campaign.id, data, userIds);
      counts = { recipients: emails, emails, pushes: 0 };
    }
    await tx.insert(festivalReservationsOpenNotices).values({
      campaignId: campaign.id,
      festivalId: festival.id,
      trigger: input.trigger,
      reservationsStartDate: festival.reservationsStartDate,
      ...channels,
      env: serverEnv.VERCEL_ENV,
      createdByUserId: actorUserId,
      ...counts,
    });
    return { kind: "sent", campaignId: campaign.id, ...counts };
  });
}

function intArray(ids: readonly number[]) {
  return sql`${sql.param([...ids])}::int[]`;
}

/**
 * Email with no inbox item: a bulk-lane row per person, tied straight to the
 * campaign, as a comunicado to visitors is. Addresses are read in SQL, never
 * passed as parameters. Returns how many were queued.
 */
async function queueEmailOnly(
  tx: NotifyTx,
  campaignId: number,
  data: FestivalReservationsOpenData,
  userIds: readonly number[],
) {
  if (userIds.length === 0) return 0;
  const { rows } = await tx.execute<{ id: number }>(sql`
    INSERT INTO notification_deliveries
      (campaign_id, user_id, template_key, channel, lane, recipient_email,
       payload, idempotency_key)
    SELECT ${campaignId}::int, u.id, ${RESERVATIONS_OPEN_KIND}::text,
      'email'::notification_delivery_channel,
      'bulk'::notification_delivery_lane,
      btrim(u.email), ${JSON.stringify(data)}::jsonb,
      'reservations-open:' || ${campaignId}::int || ':user:' || u.id || ':email'
    FROM unnest(${intArray(userIds)}) AS t(id)
    JOIN users u ON u.id = t.id
    WHERE btrim(u.email) <> ''
    ORDER BY u.id
    RETURNING id
  `);
  return rows.length;
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

/**
 * Active festivals with the automatic notice on whose reservations opened
 * inside the window, unannounced.
 */
export async function findFestivalsDueForReservationsOpenNotice(now: Date) {
  return db
    .select({ id: festivals.id })
    .from(festivals)
    .where(
      and(
        eq(festivals.status, "active"),
        eq(festivals.reservationsOpenNoticeAuto, true),
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
  /** The opening it announced. */
  reservationsStartDate: Date;
  sentByName: string | null;
  channels: ReservationsOpenChannels;
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
    reservations_start_date: Date | string;
    sent_by: string | null;
    email: boolean;
    in_app: boolean;
    push: boolean;
    recipients: number;
    emails: number;
    pushes: number;
    emails_sent: number | string;
    pushes_sent: number | string;
  }>(sql`
    SELECT o.campaign_id, o.trigger, o.created_at, o.reservations_start_date,
      o.recipients, o.emails,
      o.pushes, o.email, o.in_app, o.push,
      coalesce(nullif(btrim(u.display_name), ''),
        nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '')) AS sent_by,
      (SELECT count(*) FROM notification_deliveries d
        LEFT JOIN notifications n ON n.id = d.notification_id
        WHERE coalesce(d.campaign_id, n.campaign_id) = o.campaign_id
          AND d.channel = 'email' AND d.status = 'sent') AS emails_sent,
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
    reservationsStartDate: new Date(row.reservations_start_date),
    sentByName: row.sent_by,
    channels: { email: row.email, inApp: row.in_app, push: row.push },
    recipients: Number(row.recipients),
    emails: Number(row.emails),
    emailsSent: Number(row.emails_sent),
    pushes: Number(row.pushes),
    pushesSent: Number(row.pushes_sent),
  }));
}
