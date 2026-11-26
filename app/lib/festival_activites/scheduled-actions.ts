import "server-only";

/**
 * Cron work for activity waitlists. It checks nobody's role, so it must never
 * sit in a "use server" module, where every export is a public endpoint; the
 * cron route is its only caller.
 */

import { db } from "@/db";
import { festivalActivityWaitlist } from "@/db/schema";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { promoteFromWaitlist } from "@/app/lib/festival_activites/waitlist-promotion";

export async function processExpiredWaitlistNotifications() {
  const now = new Date();

  const expired = await db
    .select({
      id: festivalActivityWaitlist.id,
      activityId: festivalActivityWaitlist.activityId,
      notifiedForDetailId: festivalActivityWaitlist.notifiedForDetailId,
      notifiedAt: festivalActivityWaitlist.notifiedAt,
      expiresAt: festivalActivityWaitlist.expiresAt,
    })
    .from(festivalActivityWaitlist)
    .where(
      and(
        isNotNull(festivalActivityWaitlist.notifiedAt),
        isNotNull(festivalActivityWaitlist.expiresAt),
        lt(festivalActivityWaitlist.expiresAt, now),
      ),
    );

  let processed = 0;

  for (const entry of expired) {
    try {
      const freedVariantId = await db.transaction(async (tx) => {
        if (!entry.expiresAt || !entry.notifiedAt) {
          return null;
        }

        const [updated] = await tx
          .delete(festivalActivityWaitlist)
          .where(
            and(
              eq(festivalActivityWaitlist.id, entry.id),
              eq(festivalActivityWaitlist.activityId, entry.activityId),
              entry.notifiedForDetailId === null
                ? isNull(festivalActivityWaitlist.notifiedForDetailId)
                : eq(
                    festivalActivityWaitlist.notifiedForDetailId,
                    entry.notifiedForDetailId,
                  ),
              eq(festivalActivityWaitlist.notifiedAt, entry.notifiedAt),
              eq(festivalActivityWaitlist.expiresAt, entry.expiresAt),
            ),
          )
          .returning({ id: festivalActivityWaitlist.id });

        return updated ? entry.notifiedForDetailId : null;
      });

      // After the commit: promotion locks the variant on its own connection,
      // and waiting on it while this transaction still held the entry's row
      // could deadlock with an acceptance that holds the variant and waits
      // on that row.
      if (freedVariantId) {
        await promoteFromWaitlist(entry.activityId, freedVariantId);
      }

      processed++;
    } catch (error) {
      console.error("Error processing expired waitlist entry", entry.id, error);
    }
  }

  return { processed };
}
