import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import type { InboxViewer } from "@/app/lib/notifications/queries";
import { db } from "@/db";
import { notifications } from "@/db/schema";

/**
 * Reading a gift counts as having seen it: the banner announcing it never
 * shows after that, even once the item is marked unread again. Other kinds
 * keep what they had.
 */
export const CELEBRATED_ON_READ = sql`CASE WHEN ${notifications.kind} = 'credit_gift_received' THEN coalesce(${notifications.celebratedAt}, now()) ELSE ${notifications.celebratedAt} END`;

/**
 * Reads one of the viewer's items; the first read time is kept. Scoped to
 * the owner in the statement itself: someone else's id updates nothing.
 */
export async function markNotificationRead(viewer: InboxViewer, id: number) {
  await db
    .update(notifications)
    .set({ readAt: new Date(), celebratedAt: CELEBRATED_ON_READ })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, viewer.id),
        isNull(notifications.readAt),
      ),
    );
}
