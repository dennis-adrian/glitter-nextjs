import "server-only";

/**
 * Waitlist promotion: invites the next waiting profile when a slot frees up.
 * It checks nobody's role, so it must never sit in a "use server" module,
 * where every export is a public endpoint. Its callers are the admin actions
 * that free a slot and the expired-invitation cron.
 */

import { and, eq, sql } from "drizzle-orm";

import ActivityWaitlistInvitationEmail from "@/app/emails/activity-waitlist-invitation";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityWaitlist,
  festivals,
  users,
} from "@/db/schema";

export async function promoteFromWaitlist(
  activityId: number,
  freedVariantId: number,
) {
  try {
    const [variant] = await db
      .select({
        category: festivalActivityDetails.category,
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

    if (!variant || variant.waitlistWindowMinutes == null) return;
    const waitlistWindowMinutes = variant.waitlistWindowMinutes;

    await db.transaction(async (tx) => {
      const notifiedAt = new Date();
      const expiresAt = new Date(
        Date.now() + waitlistWindowMinutes * 60 * 1000,
      );

      const claimResult = await tx.execute(
        sql`
					WITH next_entry AS (
						SELECT ${festivalActivityWaitlist.id} AS id
						FROM ${festivalActivityWaitlist}
						INNER JOIN ${users}
							ON ${users.id} = ${festivalActivityWaitlist.userId}
						WHERE ${festivalActivityWaitlist.activityId} = ${activityId}
							AND ${festivalActivityWaitlist.notifiedAt} IS NULL
							${variant.category ? sql`AND ${users.category} = ${variant.category}` : sql``}
						ORDER BY ${festivalActivityWaitlist.position} ASC
						LIMIT 1
						FOR UPDATE SKIP LOCKED
					)
					UPDATE ${festivalActivityWaitlist}
					SET
						${festivalActivityWaitlist.notifiedAt} = ${notifiedAt},
						${festivalActivityWaitlist.expiresAt} = ${expiresAt},
						${festivalActivityWaitlist.notifiedForDetailId} = ${freedVariantId},
						${festivalActivityWaitlist.updatedAt} = ${notifiedAt}
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
      if (!claimedEntry) return;

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

      await sendEmail({
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
    });
  } catch (error) {
    console.error("Error promoting from waitlist", error);
  }
}
