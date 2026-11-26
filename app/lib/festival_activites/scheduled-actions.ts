import "server-only";

/**
 * Cron work for activity waitlists. It checks nobody's role, so it must never
 * sit in a "use server" module, where every export is a public endpoint; the
 * cron route is its only caller.
 */

import { db } from "@/db";
import { festivalActivityWaitlist } from "@/db/schema";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import {
  isPromotionFailure,
  promoteFromWaitlist,
} from "@/app/lib/festival_activites/waitlist-promotion";

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
    const { notifiedAt, expiresAt } = entry;
    if (!notifiedAt || !expiresAt) continue;
    try {
      // Offer the seat on before dropping the entry, with no transaction
      // open: promotion locks the variant on its own connection, and waiting
      // on it while holding the entry's row could deadlock with an acceptance
      // that holds the variant and waits on that row. The expired invitation
      // no longer counts as a seat, and its entry is not claimable again.
      if (entry.notifiedForDetailId !== null) {
        const promotion = await promoteFromWaitlist(
          entry.activityId,
          entry.notifiedForDetailId,
        );
        // Keep the expired entry, so the next run retries the invitation
        // instead of leaving the seat unoffered.
        if (isPromotionFailure(promotion)) {
          console.error(
            "Could not invite the next waitlisted profile; keeping expired entry",
            entry.id,
          );
          continue;
        }
      }

      await db
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
            eq(festivalActivityWaitlist.notifiedAt, notifiedAt),
            eq(festivalActivityWaitlist.expiresAt, expiresAt),
          ),
        );

      processed++;
    } catch (error) {
      console.error("Error processing expired waitlist entry", entry.id, error);
    }
  }

  return { processed };
}
