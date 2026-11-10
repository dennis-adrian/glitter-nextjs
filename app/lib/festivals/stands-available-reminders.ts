import "server-only";

import { and, eq, exists, inArray, sql, type SQL } from "drizzle-orm";

import {
  festivalCategories,
  invitableParticipant,
} from "@/app/lib/festivals/participant-audience";
import {
  type ReservationsOpenChannels,
  reservationsOpenChannelsProblem,
} from "@/app/lib/festivals/reservations-open-definitions";
import {
  queueEmailOnly,
  withoutLiveReservation,
} from "@/app/lib/festivals/reservations-open-notices";
import {
  type FestivalStandsAvailableData,
  STANDS_AVAILABLE_CATEGORIES,
  type StandsAvailableCategory,
  standsAvailableCopy,
} from "@/app/lib/notifications/kinds/stands-available";
import { notifyMany, type NotifyTx } from "@/app/lib/notifications/notify";
import { db } from "@/db";
import {
  festivalStandsAvailableReminders,
  festivals,
  notificationCampaigns,
  pushSubscriptions,
  stands,
  users,
} from "@/db/schema";
import { serverEnv } from "@/env";

/**
 * "Stands still available": a reminder an admin sends from the festival's
 * page while its reservations are open. Never automatic.
 *
 * It reaches verified participants (role `user`) who
 * - accepted the festival's terms (`terms_accepted`), or, when the admin
 *   widens it, every participant who could reserve (`all_eligible`);
 * - still have at least one stand they could reserve: `available`, of their
 *   category and participation type, and open to one of their subcategories
 *   when the stand is limited to some (the reservation policy's rule);
 * - hold no live reservation in the festival, and were not turned down for it.
 *
 * Each person is told about their own category. Every send is its own
 * notification campaign, delivered as a reservations-open notice is
 * (`deliverFestivalNoticeCampaign`).
 */

export const STANDS_AVAILABLE_KIND = "festival_stands_available" as const;

export type StandsAvailableAudience = "terms_accepted" | "all_eligible";

/** First key of the per-festival send lock; the notice's is 8155. */
const REMINDER_LOCK_NAMESPACE = 8156;

/** A profile's category as stands name it: the retired one is illustration. */
const standCategoryOfUser = sql`(CASE WHEN ${users.category} = 'new_artist'
  THEN 'illustration' ELSE ${users.category}::text END)`;

/**
 * Whether the person has a stand they could reserve now, by the rule the
 * reservation itself checks (`standMatchesParticipant`).
 */
function hasAvailableStand(festivalId: number) {
  return sql`EXISTS (
    SELECT 1 FROM stands s
    WHERE s.festival_id = ${festivalId}::int
      AND s.status = 'available'
      AND s.stand_category::text = ${standCategoryOfUser}
      AND s.participation_type = ${users.participationType}
      AND (
        NOT EXISTS (SELECT 1 FROM stand_subcategories ss WHERE ss.stand_id = s.id)
        OR EXISTS (
          SELECT 1 FROM stand_subcategories ss
          JOIN profile_subcategories ps ON ps.subcategory_id = ss.subcategory_id
          WHERE ss.stand_id = s.id AND ps.profile_id = ${users.id}
        )
      )
  )`;
}

function acceptedTerms(festivalId: number) {
  return sql`EXISTS (
    SELECT 1 FROM user_requests ur
    WHERE ur.user_id = ${users.id}
      AND ur.festival_id = ${festivalId}::int
      AND ur.type = 'festival_participation'
      AND ur.terms_version_id IS NOT NULL
  )`;
}

function notTurnedDown(festivalId: number) {
  return sql`NOT EXISTS (
    SELECT 1 FROM user_requests ur
    WHERE ur.user_id = ${users.id}
      AND ur.festival_id = ${festivalId}::int
      AND ur.type = 'festival_participation'
      AND ur.status = 'rejected'
  )`;
}

async function audienceWhere(
  festivalId: number,
  audience: StandsAvailableAudience,
): Promise<SQL | null> {
  const categories = await festivalCategories(festivalId);
  if (categories.length === 0) return null;
  return and(
    eq(users.role, "user"),
    invitableParticipant(categories),
    sql`${standCategoryOfUser} IN ${sql.raw(
      `(${STANDS_AVAILABLE_CATEGORIES.map((c) => `'${c}'`).join(", ")})`,
    )}`,
    audience === "terms_accepted" ? acceptedTerms(festivalId) : undefined,
    notTurnedDown(festivalId),
    withoutLiveReservation(festivalId),
    hasAvailableStand(festivalId),
  )!;
}

const hasDevice = exists(
  db
    .select({ one: sql`1` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, users.id)),
);

export type StandsAvailableAudienceCounts = Record<
  StandsAvailableAudience,
  { recipients: number; withPush: number }
>;

/** How many people each audience reaches now, and how many have a device. */
export async function countStandsAvailableAudiences(
  festivalId: number,
): Promise<StandsAvailableAudienceCounts> {
  const result: StandsAvailableAudienceCounts = {
    terms_accepted: { recipients: 0, withPush: 0 },
    all_eligible: { recipients: 0, withPush: 0 },
  };
  for (const audience of ["terms_accepted", "all_eligible"] as const) {
    const where = await audienceWhere(festivalId, audience);
    if (!where) continue;
    const [row] = await db
      .select({
        recipients: sql<number>`count(*)`.mapWith(Number),
        withPush: sql<number>`count(*) filter (where ${hasDevice})`.mapWith(
          Number,
        ),
      })
      .from(users)
      .where(where);
    result[audience] = {
      recipients: row?.recipients ?? 0,
      withPush: row?.withPush ?? 0,
    };
  }
  return result;
}

/** Stands anyone could still reserve, by category. */
export async function countAvailableStands(
  festivalId: number,
): Promise<Partial<Record<StandsAvailableCategory, number>>> {
  const rows = await db
    .select({
      category: stands.standCategory,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(stands)
    .where(
      and(
        eq(stands.festivalId, festivalId),
        eq(stands.status, "available"),
        inArray(stands.standCategory, [...STANDS_AVAILABLE_CATEGORIES]),
      ),
    )
    .groupBy(stands.standCategory);
  return Object.fromEntries(
    rows.map((row) => [row.category, row.count]),
  ) as Partial<Record<StandsAvailableCategory, number>>;
}

export type CreateReminderResult =
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
  /** Nobody to remind: no one in the audience has a stand left. */
  | { kind: "no_recipients" }
  /** The same request id sent before (a double submit). */
  | { kind: "duplicate"; campaignId: number | null };

/**
 * Writes one reminder and everything it delivers, in one transaction. Nothing
 * is sent here: pass the campaign to `deliverFestivalNoticeCampaign` once
 * this returns.
 */
export async function createStandsAvailableReminder(input: {
  festivalId: number;
  audience: StandsAvailableAudience;
  channels: ReservationsOpenChannels;
  /** Minted per confirm click, so a double submit is one send. */
  requestId: string;
  actorUserId: number;
  now: Date;
}): Promise<CreateReminderResult> {
  const problem = reservationsOpenChannelsProblem(input.channels);
  if (problem) return { kind: "invalid_channels", message: problem };

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${REMINDER_LOCK_NAMESPACE}, ${input.festivalId}::int)`,
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

    const idempotencyKey = `stands-available:${input.requestId}`;
    const [previous] = await tx
      .select({ id: notificationCampaigns.id })
      .from(notificationCampaigns)
      .where(eq(notificationCampaigns.idempotencyKey, idempotencyKey));
    if (previous) return { kind: "duplicate", campaignId: previous.id };

    const recipients = await audienceRecipients(
      tx,
      festival.id,
      input.audience,
    );
    if (recipients.length === 0) return { kind: "no_recipients" };

    const sample = standsAvailableCopy({
      festivalId: festival.id,
      festivalName: festival.name,
      category: "illustration",
    });
    const [campaign] = await tx
      .insert(notificationCampaigns)
      .values({
        type: "stands_available",
        // Everything is written below, in this transaction.
        status: "completed",
        completedAt: input.now,
        title: sample.title,
        message: "Recordatorio de espacios disponibles",
        createdByUserId: input.actorUserId,
        idempotencyKey,
      })
      .returning({ id: notificationCampaigns.id });

    // One fan-out per category: each person is told about their own.
    const counts = { recipients: 0, emails: 0, pushes: 0 };
    for (const category of STANDS_AVAILABLE_CATEGORIES) {
      const userIds = recipients
        .filter((row) => row.category === category)
        .map((row) => row.id);
      if (userIds.length === 0) continue;
      const data: FestivalStandsAvailableData = {
        festivalId: festival.id,
        festivalName: festival.name,
        category,
      };
      if (input.channels.inApp) {
        const result = await notifyMany(tx, {
          kind: STANDS_AVAILABLE_KIND,
          data,
          userIds,
          dedupeKey: `festival-stands-available:${campaign!.id}`,
          campaignId: campaign!.id,
          email: input.channels.email ? "bulk" : null,
          push: input.channels.push,
        });
        counts.recipients += result.createdUserIds.length;
        counts.emails += result.emailDeliveryIds.length;
        counts.pushes += result.pushDeliveryIds.length;
      } else {
        const emails = await queueEmailOnly(tx, {
          campaignId: campaign!.id,
          kind: STANDS_AVAILABLE_KIND,
          payload: data,
          userIds,
        });
        counts.recipients += emails;
        counts.emails += emails;
      }
    }

    await tx.insert(festivalStandsAvailableReminders).values({
      campaignId: campaign!.id,
      festivalId: festival.id,
      audience: input.audience,
      env: serverEnv.VERCEL_ENV,
      ...input.channels,
      createdByUserId: input.actorUserId,
      ...counts,
    });
    return { kind: "sent", campaignId: campaign!.id, ...counts };
  });
}

async function audienceRecipients(
  tx: NotifyTx,
  festivalId: number,
  audience: StandsAvailableAudience,
) {
  const where = await audienceWhere(festivalId, audience);
  if (!where) return [];
  // FOR KEY SHARE, as the reservations-open notice's: an account deleted
  // meanwhile waits for the send rather than failing it.
  const rows = await tx
    .select({ id: users.id, category: standCategoryOfUser })
    .from(users)
    .where(where)
    .orderBy(users.id)
    .for("key share");
  return rows.map((row) => ({
    id: row.id,
    category: row.category as StandsAvailableCategory,
  }));
}

export type StandsAvailableReminderSummary = {
  campaignId: number;
  audience: StandsAvailableAudience;
  createdAt: Date;
  sentByName: string | null;
  channels: ReservationsOpenChannels;
  recipients: number;
  emails: number;
  emailsSent: number;
  pushes: number;
  pushesSent: number;
};

/** A festival's reminders, newest first, with how far their delivery got. */
export async function fetchStandsAvailableReminders(
  festivalId: number,
  limit = 10,
): Promise<StandsAvailableReminderSummary[]> {
  const { rows } = await db.execute<{
    campaign_id: number;
    audience: StandsAvailableAudience;
    created_at: Date | string;
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
    SELECT o.campaign_id, o.audience, o.created_at, o.recipients, o.emails,
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
    FROM festival_stands_available_reminders o
    LEFT JOIN users u ON u.id = o.created_by_user_id
    WHERE o.festival_id = ${festivalId}::int
    ORDER BY o.created_at DESC, o.campaign_id DESC
    LIMIT ${limit}::int
  `);
  return rows.map((row) => ({
    campaignId: Number(row.campaign_id),
    audience: row.audience,
    createdAt: new Date(row.created_at),
    sentByName: row.sent_by,
    channels: { email: row.email, inApp: row.in_app, push: row.push },
    recipients: Number(row.recipients),
    emails: Number(row.emails),
    emailsSent: Number(row.emails_sent),
    pushes: Number(row.pushes),
    pushesSent: Number(row.pushes_sent),
  }));
}
