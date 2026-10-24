import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { InboxViewer } from "@/app/lib/notifications/queries";
import { db } from "@/db";
import { notifications } from "@/db/schema";

/**
 * Reads one of the viewer's items; the first read time is kept. Scoped to
 * the owner in the statement itself: someone else's id updates nothing.
 */
export async function markNotificationRead(viewer: InboxViewer, id: number) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, viewer.id),
        isNull(notifications.readAt),
      ),
    );
}
