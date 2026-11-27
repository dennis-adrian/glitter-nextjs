import "server-only";

/**
 * Waitlist promotion: invites the next waiting profile when a slot frees up.
 * It checks nobody's role, so it must never sit in a "use server" module,
 * where every export is a public endpoint. Its callers are the admin actions
 * that free a slot and the expired-invitation cron.
 */

import { and, count, eq, gt, isNull, sql } from "drizzle-orm";

import ActivityWaitlistInvitationEmail from "@/app/emails/activity-waitlist-invitation";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent } from "@/app/vendors/resend-result";
import {
  eligibleWaitlistEntries,
  lockVariant,
} from "@/app/lib/festival_activites/queries";
import { db } from "@/db";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipants,
  festivalActivityWaitlist,
  festivals,
  users,
} from "@/db/schema";

/** Who was invited to the freed slot, or null when nobody was due one. */
export type WaitlistPromotion = {
  userId: number;
  displayName: string | null;
} | null;

/**
 * The invitation could not be made (the email provider or the database
 * failed). The claim is rolled back, so the person keeps their place and
 * staff can retry.
 */
export type WaitlistPromotionFailure = { failed: true };

export function isPromotionFailure(
  promotion: WaitlistPromotion | WaitlistPromotionFailure,
): promotion is WaitlistPromotionFailure {
  return promotion !== null && "failed" in promotion;
}

/**
 * Most invitations one request sends: each one waits for an email, and a
 * later enrolment attempt offers whatever seats remain.
 */
const MAX_SEAT_OFFERS = 5;

/**
 * Invites waiters to a variant's free seats, one per seat: a raised limit can
 * free several at once, and nothing else would offer the rest. Each promotion
 * counts again under the variant lock, so it stops once no seat is left. No
 * job retries a failure, so it is logged for staff to invite by hand.
 */
export async function offerFreeSeats(activityId: number, detailId: number) {
  for (let offer = 0; offer < MAX_SEAT_OFFERS; offer++) {
    const promotion = await promoteFromWaitlist(activityId, detailId);
    if (isPromotionFailure(promotion)) {
      console.error("Could not offer a seat to the waitlist", {
        activityId,
        detailId,
      });
      return;
    }
    if (!promotion) return;
  }
}

/**
 * Invites the next eligible waiting profile to a slot in `freedVariantId`,
 * when the variant really has one: active participants plus unexpired
 * invitations must sit below its limit. A caller that frees a slot in an
 * over-capacity variant (a move or a removal there) invites nobody.
 */
export async function promoteFromWaitlist(
  activityId: number,
  freedVariantId: number,
): Promise<WaitlistPromotion | WaitlistPromotionFailure> {
  try {
    const [variant] = await db
      .select({
        activityName: festivalActivities.name,
        waitlistWindowMinutes: festivalActivities.waitlistWindowMinutes,
        festivalId: festivalActivities.festivalId,
        festivalName: festivals.name,
        festivalType: festivals.festivalType,
      })
      .from(festivalActivityDetails)
      .innerJoin(
        festivalActivities,
        eq(festivalActivities.id, festivalActivityDetails.activityId),
      )
      .innerJoin(festivals, eq(festivals.id, festivalActivities.festivalId))
      .where(
        and(
          eq(festivalActivityDetails.id, freedVariantId),
          // The invitation is for a slot in this variant, so it must be one of
          // the activity whose waitlist is being promoted.
          eq(festivalActivityDetails.activityId, activityId),
        ),
      );

    if (!variant || variant.waitlistWindowMinutes == null) return null;
    const waitlistWindowMinutes = variant.waitlistWindowMinutes;

    return await db.transaction(async (tx): Promise<WaitlistPromotion> => {
      // Locking the variant serializes promotions into it, so two freed-slot
      // events cannot both count the same last seat. Its limit and category
      // are the ones read under the lock, in case staff just changed them.
      const capacity = await lockVariant(tx, freedVariantId);
      if (!capacity) return null;
      if (capacity.participationLimit) {
        const now = new Date();
        const [{ activeCount }] = await tx
          .select({ activeCount: count() })
          .from(festivalActivityParticipants)
          .where(
            and(
              eq(festivalActivityParticipants.detailsId, freedVariantId),
              isNull(festivalActivityParticipants.removedAt),
            ),
          );
        const [{ reservedCount }] = await tx
          .select({ reservedCount: count() })
          .from(festivalActivityWaitlist)
          .where(
            and(
              eq(festivalActivityWaitlist.notifiedForDetailId, freedVariantId),
              gt(festivalActivityWaitlist.expiresAt, now),
            ),
          );
        if (activeCount + reservedCount >= capacity.participationLimit) {
          return null;
        }
      }

      const notifiedAt = new Date();
      const expiresAt = new Date(
        Date.now() + waitlistWindowMinutes * 60 * 1000,
      );

      // SET names bare columns: Postgres refuses a table-qualified one there,
      // which is how a column interpolated into `sql` renders. The lock is on
      // the waitlist row only: the join would also lock the invitee's `users`
      // row through the email send, and SKIP LOCKED would pass over a waiter
      // whose `users` row someone else holds.
      const claimResult = await tx.execute(
        sql`
					WITH next_entry AS (
						SELECT ${festivalActivityWaitlist.id} AS id
						FROM ${festivalActivityWaitlist}
						INNER JOIN ${users}
							ON ${users.id} = ${festivalActivityWaitlist.userId}
						WHERE ${eligibleWaitlistEntries(activityId, capacity.category)}
						ORDER BY ${festivalActivityWaitlist.position} ASC
						LIMIT 1
						FOR UPDATE OF ${festivalActivityWaitlist} SKIP LOCKED
					)
					UPDATE ${festivalActivityWaitlist}
					SET
						${sql.identifier(festivalActivityWaitlist.notifiedAt.name)} = ${notifiedAt},
						${sql.identifier(festivalActivityWaitlist.expiresAt.name)} = ${expiresAt},
						${sql.identifier(festivalActivityWaitlist.notifiedForDetailId.name)} = ${freedVariantId},
						${sql.identifier(festivalActivityWaitlist.updatedAt.name)} = ${notifiedAt}
					FROM next_entry
					WHERE ${festivalActivityWaitlist.id} = next_entry.id
					RETURNING
						${festivalActivityWaitlist.id} AS id,
						${festivalActivityWaitlist.userId} AS "userId"
				`,
      );

      const claimedEntry = claimResult.rows[0] as
        | { id: number; userId: number }
        | undefined;
      if (!claimedEntry) return null;

      const [nextUser] = await tx
        .select({
          userEmail: users.email,
          userDisplayName: users.displayName,
          userFirstName: users.firstName,
          userLastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, claimedEntry.userId))
        .limit(1);

      if (!nextUser) {
        throw new Error("Claimed waitlist user not found");
      }

      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const activityUrl = `${baseUrl}/profiles/${claimedEntry.userId}/festivals/${variant.festivalId}/activity/${activityId}`;

      const result = await sendEmail({
        from: "Actividades del Festival <no-reply@productoraglitter.com>",
        to: [nextUser.userEmail],
        subject: `Tenés un cupo disponible en ${variant.activityName}`,
        react: ActivityWaitlistInvitationEmail({
          userDisplayName: nextUser.userDisplayName,
          userFirstName: nextUser.userFirstName,
          userLastName: nextUser.userLastName,
          activityName: variant.activityName,
          festivalName: variant.festivalName,
          festivalType: variant.festivalType,
          expiresAt,
          activityUrl,
        }),
      });
      // Throwing rolls back the claim above, as a timeout already does: marked
      // notified without an email, the person would lose their place once the
      // window expired. Only the expiry cron retries on its own; otherwise the
      // next freed seat or an admin's retry reaches them, and self-enrolment
      // leaves the seat to them meanwhile.
      assertSent(result);
      return {
        userId: claimedEntry.userId,
        displayName: nextUser.userDisplayName,
      };
    });
  } catch (error) {
    console.error("Error promoting from waitlist", error);
    return { failed: true };
  }
}
