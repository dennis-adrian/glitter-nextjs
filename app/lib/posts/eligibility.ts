import { cache } from "react";
import { and, countDistinct, eq } from "drizzle-orm";

import { db } from "@/db";
import { reservationParticipants, standReservations } from "@/db/schema";
import type { BaseProfile } from "@/app/api/users/definitions";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";

const REQUIRED_DISTINCT_FESTIVALS = 3;
const REQUIRED_RESERVATIONS = 3;

/**
 * Whether this profile may write blog articles.
 *
 * Staff always may, and are deliberately checked before the flag: phase one of
 * the rollout is a blog written by admins and only read by participants, so
 * `blog_contributors` gates participant authoring without touching the
 * dashboard.
 *
 * Every entry point to participant authoring resolves through here — the
 * portal CTA, the `/portal/blog` routes, `startNewPortalDraft`, and the
 * `blogImage` upload — so the flag is enforced once rather than at each door.
 */
export const canAuthorPosts = cache(
  async (profile: BaseProfile | null | undefined): Promise<boolean> => {
    if (!profile) return false;
    if (profile.role === "admin" || profile.role === "festival_admin") {
      return true;
    }

    if (!(await isFeatureEnabled("blog_contributors", profile))) {
      return false;
    }

    const [row] = await db
      .select({
        festivalCount: countDistinct(standReservations.festivalId),
        reservationCount: countDistinct(standReservations.id),
      })
      .from(reservationParticipants)
      .innerJoin(
        standReservations,
        eq(reservationParticipants.reservationId, standReservations.id),
      )
      .where(
        and(
          eq(reservationParticipants.userId, profile.id),
          eq(standReservations.status, "accepted"),
        ),
      );

    if (!row) return false;
    return (
      Number(row.festivalCount) >= REQUIRED_DISTINCT_FESTIVALS &&
      Number(row.reservationCount) >= REQUIRED_RESERVATIONS
    );
  },
);
