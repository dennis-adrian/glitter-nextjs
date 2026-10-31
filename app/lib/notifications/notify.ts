import "server-only";

import { and, eq, sql } from "drizzle-orm";

import {
  buildInAppCopy,
  hasEmail,
  notificationCategory,
  type NotificationData,
  type NotificationKind,
  notificationPushes,
  notificationStartsRead,
  parseNotificationData,
} from "@/app/lib/notifications/registry";
import { safeActionPath } from "@/app/lib/notifications/definitions";
import { db } from "@/db";
import { notificationDeliveries, notifications } from "@/db/schema";

export type NotifyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NotifyResult = {
  notificationId: number;
  /** Deliveries this call created; schedule them once the caller commits. */
  deliveryIds: number[];
  /** False when the dedupe key had already notified this person. */
  created: boolean;
};

/**
 * Records one notification for one person inside the caller's transaction: the
 * inbox item; when the kind has an email and an address is given, its email
 * delivery; and when the kind pushes, one push delivery per device the person
 * turned avisos on for. All of it commits with the business change or none
 * does.
 *
 * Nothing is sent here. Pass the returned ids to
 * `scheduleNotificationDeliveries` after the transaction commits; the cron
 * picks up whatever that misses.
 *
 * The dedupe key is per person, and should name the event rather than the
 * entity: `credit-gift:12` notifies each recipient of gift 12 once, however
 * often the worker retries.
 */
export async function notify<K extends NotificationKind>(
  tx: NotifyTx,
  input: {
    userId: number;
    kind: K;
    data: NotificationData<K>;
    dedupeKey: string;
    campaignId?: number | null;
    /** Where the email goes. Omit for an in-app-only notification. */
    email?: string | null;
    /**
     * Whether its sender asked for a push. Read only by per-send kinds (a
     * comunicado); every other kind pushes by its registry entry alone.
     */
    push?: boolean;
  },
): Promise<NotifyResult> {
  // A snapshot the registry cannot read back would store an item that renders
  // nothing and an email that can never send. That is a caller bug: fail the
  // transaction rather than commit it.
  const data = parseNotificationData(input.kind, input.data);
  if (!data) {
    throw new Error(`notification_data_invalid:${input.kind}`);
  }
  const copy = buildInAppCopy(input.kind, data);

  const [inserted] = await tx
    .insert(notifications)
    .values({
      userId: input.userId,
      kind: input.kind,
      category: notificationCategory(input.kind),
      title: copy.title,
      body: copy.body,
      actionPath: safeActionPath(copy.actionPath),
      actionLabel: copy.actionLabel,
      data: data as Record<string, unknown>,
      campaignId: input.campaignId ?? null,
      dedupeKey: input.dedupeKey,
      readAt: notificationStartsRead(input.kind, data) ? sql`now()` : null,
    })
    .onConflictDoNothing({
      target: [notifications.userId, notifications.dedupeKey],
    })
    .returning({ id: notifications.id });

  if (!inserted) {
    const [existing] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, input.userId),
          eq(notifications.dedupeKey, input.dedupeKey),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("notification_dedupe_missing");
    return { notificationId: existing.id, deliveryIds: [], created: false };
  }

  const deliveryIds: number[] = [];
  const email = input.email?.trim();
  if (email && hasEmail(input.kind)) {
    const [delivery] = await tx
      .insert(notificationDeliveries)
      .values({
        notificationId: inserted.id,
        userId: input.userId,
        templateKey: input.kind,
        recipientEmail: email,
        payload: data as Record<string, unknown>,
        idempotencyKey: `notification:${inserted.id}:email`,
      })
      .returning({ id: notificationDeliveries.id });
    if (delivery) deliveryIds.push(delivery.id);
  }

  if (notificationPushes(input.kind, data, { push: input.push })) {
    // One statement whether or not the person has devices: no read first,
    // since the reservation mirrors run while holding the festival's lock.
    // The push renders from the inbox item when sent, so no payload is kept.
    // FOR KEY SHARE: a device removed meanwhile is skipped rather than
    // failing the foreign key, which would take the inbox item down with it.
    const pushed = await tx.execute<{ id: number }>(sql`
      INSERT INTO notification_deliveries
        (notification_id, user_id, template_key, channel,
         push_subscription_id, payload, idempotency_key)
      SELECT ${inserted.id}::integer, ${input.userId}::integer,
        ${input.kind}::text, 'push'::notification_delivery_channel,
        ps.id, '{}'::jsonb,
        ${`notification:${inserted.id}:push:`}::text || ps.id
      FROM push_subscriptions ps
      WHERE ps.user_id = ${input.userId}::integer
      ORDER BY ps.id
      FOR KEY SHARE
      RETURNING id
    `);
    for (const row of pushed.rows) deliveryIds.push(Number(row.id));
  }

  return { notificationId: inserted.id, deliveryIds, created: true };
}

export type NotifyManyResult = {
  /**
   * Every requested person who has the item after this call, new or already
   * there; someone no longer in `users` is absent.
   */
  notificationIdByUser: Map<number, number>;
  /** Whose item this call wrote, in id order. */
  createdUserIds: number[];
  /** Lane 'bulk': the bulk email lane drains them, never scheduled. */
  emailDeliveryIds: number[];
  /** Lane 'bulk': drained by `sendBulkPushes`, never scheduled. */
  pushDeliveryIds: number[];
};

function intArray(ids: readonly number[]) {
  return sql`${sql.param([...ids])}::int[]`;
}

/**
 * `notify()` for many people at once, in a few statements however many they
 * are: a comunicado's fan-out (docs/IMPLEMENTATION-comunicados.md D2). The
 * same contract: one item per person per dedupe key, and someone who already
 * had it gets no new deliveries.
 *
 * Its deliveries are the bulk lane's. Email goes only when the caller asks
 * for it (`email: "bulk"`), whatever the kind's own email, and the address is
 * read in SQL, never passed as a parameter, so the query logger never prints
 * thousands of addresses. Pushes follow the kind, as in `notify()`.
 */
export async function notifyMany<K extends NotificationKind>(
  tx: NotifyTx,
  input: {
    kind: K;
    data: NotificationData<K>;
    userIds: readonly number[];
    dedupeKey: string;
    campaignId?: number | null;
    /** "bulk": an email row for each new item, sent by the bulk lane. */
    email?: "bulk" | null;
    /** What the email row stores; the data itself when omitted. */
    emailPayload?: Record<string, unknown>;
    /** As in `notify()`: read only by per-send kinds. */
    push?: boolean;
  },
): Promise<NotifyManyResult> {
  const data = parseNotificationData(input.kind, input.data);
  if (!data) {
    throw new Error(`notification_data_invalid:${input.kind}`);
  }
  const result: NotifyManyResult = {
    notificationIdByUser: new Map(),
    createdUserIds: [],
    emailDeliveryIds: [],
    pushDeliveryIds: [],
  };
  const userIds = [...new Set(input.userIds)].sort((a, b) => a - b);
  if (userIds.length === 0) return result;
  const copy = buildInAppCopy(input.kind, data);

  // Joined to users, so someone deleted meanwhile is left out rather than
  // failing the foreign key for everyone.
  const inserted = await tx.execute<{ id: number; user_id: number }>(sql`
    INSERT INTO notifications
      (user_id, kind, category, title, body, action_path, action_label,
       data, campaign_id, dedupe_key, read_at)
    SELECT u.id, ${input.kind}::text,
      ${notificationCategory(input.kind)}::notification_category,
      ${copy.title}::text, ${copy.body}::text,
      ${safeActionPath(copy.actionPath)}::text, ${copy.actionLabel}::text,
      ${JSON.stringify(data)}::jsonb, ${input.campaignId ?? null}::integer,
      ${input.dedupeKey}::text,
      CASE WHEN ${notificationStartsRead(input.kind, data)}::boolean THEN now() END
    FROM unnest(${intArray(userIds)}) AS t(id)
    JOIN users u ON u.id = t.id
    ORDER BY u.id
    ON CONFLICT (user_id, dedupe_key) DO NOTHING
    RETURNING id, user_id
  `);
  const created = new Map<number, number>();
  for (const row of inserted.rows) {
    created.set(Number(row.user_id), Number(row.id));
  }
  result.notificationIdByUser = new Map(created);
  result.createdUserIds = [...created.keys()].sort((a, b) => a - b);

  if (created.size < userIds.length) {
    // Already notified under this key, or gone from users.
    const existing = await tx.execute<{ id: number; user_id: number }>(sql`
      SELECT id, user_id FROM notifications
      WHERE dedupe_key = ${input.dedupeKey}::text
        AND user_id = ANY(${intArray(userIds)})
    `);
    for (const row of existing.rows) {
      result.notificationIdByUser.set(Number(row.user_id), Number(row.id));
    }
  }
  if (created.size === 0) return result;

  const newItemIds = result.createdUserIds.map(
    (userId) => created.get(userId)!,
  );
  if (input.email === "bulk") {
    // `notify()` skips a blank address the same way; the CHECK wants one.
    const emails = await tx.execute<{ id: number }>(sql`
      INSERT INTO notification_deliveries
        (notification_id, user_id, template_key, channel, lane,
         recipient_email, payload, idempotency_key)
      SELECT n.id, n.user_id, ${input.kind}::text,
        'email'::notification_delivery_channel,
        'bulk'::notification_delivery_lane,
        btrim(u.email), ${JSON.stringify(input.emailPayload ?? data)}::jsonb,
        'notification:' || n.id || ':email'
      FROM unnest(${intArray(newItemIds)}) AS t(nid)
      JOIN notifications n ON n.id = t.nid
      JOIN users u ON u.id = n.user_id
      WHERE btrim(u.email) <> ''
      ORDER BY n.id
      RETURNING id
    `);
    for (const row of emails.rows) result.emailDeliveryIds.push(Number(row.id));
  }

  if (notificationPushes(input.kind, data, { push: input.push })) {
    // As in `notify()`: FOR KEY SHARE skips a device removed meanwhile rather
    // than failing the foreign key. OF ps: a function scan cannot be locked.
    const pushed = await tx.execute<{ id: number }>(sql`
      INSERT INTO notification_deliveries
        (notification_id, user_id, template_key, channel, lane,
         push_subscription_id, payload, idempotency_key)
      SELECT t.nid, t.user_id, ${input.kind}::text,
        'push'::notification_delivery_channel,
        'bulk'::notification_delivery_lane,
        ps.id, '{}'::jsonb, 'notification:' || t.nid || ':push:' || ps.id
      FROM push_subscriptions ps
      JOIN unnest(${intArray(result.createdUserIds)}, ${intArray(newItemIds)})
        AS t(user_id, nid) ON ps.user_id = t.user_id
      ORDER BY ps.id
      FOR KEY SHARE OF ps
      RETURNING id
    `);
    for (const row of pushed.rows) result.pushDeliveryIds.push(Number(row.id));
  }

  return result;
}
