import "server-only";

import { and, eq } from "drizzle-orm";

import {
  buildInAppCopy,
  hasEmail,
  notificationCategory,
  type NotificationData,
  type NotificationKind,
  parseNotificationData,
} from "@/app/lib/notifications/registry";
import { safeActionPath } from "@/app/lib/notifications/definitions";
import { db } from "@/db";
import { notificationDeliveries, notifications } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NotifyResult = {
  notificationId: number;
  /** Deliveries this call created; schedule them once the caller commits. */
  deliveryIds: number[];
  /** False when the dedupe key had already notified this person. */
  created: boolean;
};

/**
 * Records one notification for one person inside the caller's transaction: the
 * inbox item and, when the kind has an email and an address is given, its
 * delivery row. Either both commit with the business change or neither does.
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
  tx: DbTx,
  input: {
    userId: number;
    kind: K;
    data: NotificationData<K>;
    dedupeKey: string;
    campaignId?: number | null;
    /** Where the email goes. Omit for an in-app-only notification. */
    email?: string | null;
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

  return { notificationId: inserted.id, deliveryIds, created: true };
}
