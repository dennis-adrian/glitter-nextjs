import "server-only";

/**
 * Server-side reads for festivals. None of them checks who is asking, so they
 * must never sit in a "use server" module, where every export is a public
 * endpoint. Callers authorize first, or hand client components only what the
 * function already narrows to.
 */

import { ParticipationWithParticipantWithInfractionsAndReservations } from "@/app/api/users/definitions";
import { db } from "@/db";
import {
  festivalActivities,
  festivals,
  infractions,
  reservationParticipants,
  standReservations,
  userRequests,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  FestivalActivityWithDetailsAndParticipants,
  FullFestival,
} from "./definitions";

/**
 * The profile fields an activity's participant and waitlist rows carry. The
 * activities reach client components on pages any signed-in user can open, and
 * on the public map, so they never carry contact or identity data.
 */
const activityProfileColumns = {
  columns: {
    id: true,
    displayName: true,
    imageUrl: true,
    category: true,
    status: true,
  },
} as const;

/**
 * The active festival, or the one with `id`, with its whole roster: every
 * enrolled profile with its participations, every reservation, and the
 * activities with every participant's proofs and every vote. Pages that hand
 * it to client components strip the roster and scope the activities to the
 * profile first (`withoutParticipantRoster`).
 */
export async function fetchFestival({
  acceptedUsersOnly = false,
  id,
}: {
  acceptedUsersOnly?: boolean;
  id?: number;
}): Promise<FullFestival | null | undefined> {
  const whereCondition = acceptedUsersOnly
    ? { where: eq(userRequests.status, "accepted") }
    : {};

  const festivalWhereCondition = id
    ? { where: eq(festivals.id, id) }
    : { where: eq(festivals.status, "active") };

  try {
    return await db.query.festivals.findFirst({
      ...festivalWhereCondition,
      with: {
        festivalDates: true,
        userRequests: {
          with: {
            user: {
              with: {
                participations: {
                  with: {
                    reservation: {
                      with: {
                        stand: true,
                        festival: true,
                      },
                    },
                  },
                },
                userRequests: true,
              },
            },
          },
          ...whereCondition,
        },
        standReservations: true,
        festivalSectors: {
          with: {
            stands: true,
          },
        },
        festivalActivities: {
          with: {
            details: {
              with: {
                participants: {
                  with: {
                    user: activityProfileColumns,
                    proofs: true,
                  },
                },
                votes: true,
              },
            },
            waitlistEntries: { with: { user: activityProfileColumns } },
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching festival", error);
    throw error;
  }
}

/**
 * A festival's activities with their participants, every participant's proofs
 * (with staff feedback), every vote with its voter, and the waitlists. Pages
 * that hand them to a participant's client components pass each through
 * `scopeActivityToViewer` first; public pages derive only what they render.
 */
export async function fetchFestivalActivitiesByFestivalId(
  festivalId: number,
): Promise<FestivalActivityWithDetailsAndParticipants[]> {
  try {
    return (await db.query.festivalActivities.findMany({
      where: eq(festivalActivities.festivalId, festivalId),
      with: {
        details: {
          with: {
            participants: {
              with: {
                proofs: true,
                user: activityProfileColumns,
              },
            },
            votes: true,
          },
        },
        waitlistEntries: { with: { user: activityProfileColumns } },
      },
    })) as FestivalActivityWithDetailsAndParticipants[];
  } catch (error) {
    console.error("Error fetching festival activities by festival id", error);
    throw error;
  }
}

/**
 * Every participation on the festival's reservations, with the participant's
 * full profile and their infractions at this festival. Staff screens only; the
 * participant-facing best-stand page narrows it before rendering.
 */
export async function fetchFestivalParticipants(
  festivalId: number,
  confirmedOnly = false,
): Promise<ParticipationWithParticipantWithInfractionsAndReservations[]> {
  const whereCondition = confirmedOnly
    ? and(
        eq(standReservations.festivalId, festivalId),
        eq(standReservations.status, "accepted"),
      )
    : eq(standReservations.festivalId, festivalId);

  try {
    const participantsWithReservationsSubquery = db
      .select({ id: standReservations.id })
      .from(standReservations)
      .where(whereCondition);

    return await db.query.reservationParticipants.findMany({
      where: inArray(
        reservationParticipants.reservationId,
        participantsWithReservationsSubquery,
      ),
      with: {
        user: {
          with: {
            infractions: {
              where: eq(infractions.festivalId, festivalId),
              with: {
                type: true,
              },
            },
          },
        },
        reservation: {
          with: {
            stand: true,
            // A full table holds two stands; `stand` alone names only the one
            // the participant picked first.
            members: { with: { stand: true } },
            festival: true,
          },
        },
      },
    });
  } catch (error) {
    // Rethrown, not swallowed. Returning [] asserted the festival had no
    // participants, so a query that could not run rendered as an empty table
    // and read as a plausible answer — that is how an unresolvable `users`
    // relation sat here undetected. The route's error boundary says what
    // happened instead.
    console.error("Error fetching festival participants", error);
    throw error;
  }
}
