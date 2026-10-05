import "server-only";

/**
 * Server-side reads for festival activities. They must never sit in a
 * "use server" module, where every export is a public endpoint. Each one says
 * whom it serves: some check the session themselves, the rest expect callers
 * to authorize first.
 */

import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import {
  getCurrentUserProfile,
  requireAdminOrFestivalAdmin,
} from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipants,
  festivals,
  festivalSectors,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

async function queryFestivalActivity(
  activityId: number,
  { withRealNames }: { withRealNames: boolean },
): Promise<FestivalActivityWithDetailsAndParticipants | null> {
  // The activity is handed to client components on participant pages, so the
  // participant and waitlist profiles carry only what those pages render.
  const user = {
    columns: {
      id: true,
      displayName: true,
      imageUrl: true,
      category: true,
      status: true,
      firstName: withRealNames,
      lastName: withRealNames,
    },
  } as const;

  try {
    const activity = await db.query.festivalActivities.findFirst({
      where: eq(festivalActivities.id, activityId),
      with: {
        details: {
          orderBy: (details, { asc }) => [asc(details.id)],
          with: {
            participants: {
              with: {
                user,
                proofs: true,
              },
            },
            votes: true,
          },
        },
        waitlistEntries: { with: { user } },
      },
    });

    return activity ?? null;
  } catch (error) {
    console.error("Error fetching festival activity", error);
    return null;
  }
}

/**
 * Keeps only what a participant page shows the viewer: their own votes,
 * waitlist entry, removal reason and proof feedback. Other participants keep
 * their profile and design images, which the enrollment and voting pages list.
 */
function scopeActivityToViewer(
  activity: FestivalActivityWithDetailsAndParticipants,
  viewerId: number | null,
): FestivalActivityWithDetailsAndParticipants {
  return {
    ...activity,
    details: activity.details.map((detail) => ({
      ...detail,
      votes: detail.votes.filter((vote) => vote.voterId === viewerId),
      participants: detail.participants.map((participant) =>
        participant.userId === viewerId
          ? participant
          : {
              ...participant,
              removalReason: null,
              proofs: participant.proofs.map((proof) => ({
                ...proof,
                adminFeedback: null,
                promoHighlight: null,
                promoDescription: null,
                promoConditions: null,
              })),
            },
      ),
    })),
    waitlistEntries: activity.waitlistEntries.filter(
      (entry) => entry.userId === viewerId,
    ),
  };
}

/**
 * An activity with its variants, participants, proofs, votes and waitlist,
 * for the signed-in viewer. Profiles are narrowed to public fields, and a
 * viewer who is not staff gets only their own votes, waitlist entry and review
 * feedback, so the result is safe to pass to client components on pages any
 * signed-in user can open.
 */
export async function fetchFestivalActivity(activityId: number) {
  const [viewer, activity] = await Promise.all([
    getCurrentUserProfile(),
    queryFestivalActivity(activityId, { withRealNames: false }),
  ]);
  if (!activity) return null;

  const isStaff = viewer?.role === "admin" || viewer?.role === "festival_admin";
  return isStaff
    ? activity
    : scopeActivityToViewer(activity, viewer?.id ?? null);
}

/**
 * The whole activity plus each participant's first and last name, which staff
 * screens show when a profile has no display name. Null for anyone who is not
 * an admin or festival admin.
 */
export async function fetchFestivalActivityForStaff(activityId: number) {
  const staff = await requireAdminOrFestivalAdmin();
  if (!staff) return null;

  return queryFestivalActivity(activityId, { withRealNames: true });
}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Whether staff removed the profile from any variant of the activity. A
 * removal bars the whole activity, not only the variant it happened in: the
 * profile may not enroll in another variant, join the waitlist or take a
 * waitlist slot. Only staff restore a removed participant.
 */
export async function wasRemovedFromActivity(
  executor: DbOrTx,
  activityId: number,
  userId: number,
): Promise<boolean> {
  const [removed] = await executor
    .select({ id: festivalActivityParticipants.id })
    .from(festivalActivityParticipants)
    .innerJoin(
      festivalActivityDetails,
      eq(festivalActivityDetails.id, festivalActivityParticipants.detailsId),
    )
    .where(
      and(
        eq(festivalActivityDetails.activityId, activityId),
        eq(festivalActivityParticipants.userId, userId),
        isNotNull(festivalActivityParticipants.removedAt),
      ),
    )
    .limit(1);

  return removed !== undefined;
}

/** The profile id that owns an activity participation, or null when there is none. */
export async function fetchActivityParticipationOwnerId(
  participationId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ userId: festivalActivityParticipants.userId })
    .from(festivalActivityParticipants)
    .where(eq(festivalActivityParticipants.id, participationId))
    .limit(1);

  return row?.userId ?? null;
}

export type ParticipationPreviewData = {
  imageUrl: string | null;
  participantName: string | null;
  standLabels: string[];
  sectorName: string | null;
};

/**
 * Coupon-book preview data (participant name and avatar, stand labels, sector)
 * for each participation id. Only for callers that have already admitted staff
 * or the participation's owner.
 */
export async function fetchParticipationPreviewDataBatch(
  participationIds: number[],
): Promise<Record<number, ParticipationPreviewData>> {
  if (participationIds.length === 0) return {};

  const uniqueParticipationIds = [...new Set(participationIds)];

  const rows = await db
    .select({
      participationId: festivalActivityParticipants.id,
      imageUrl: users.imageUrl,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      standLabels: sql<string[]>`
				coalesce(
					array_agg(
						concat(${stands.label}, ${stands.standNumber})
					) filter (where ${stands.label} is not null),
					'{}'
				)
			`,
      sectorName: sql<string | null>`max(${festivalSectors.name})`,
    })
    .from(festivalActivityParticipants)
    .innerJoin(users, eq(users.id, festivalActivityParticipants.userId))
    .innerJoin(
      festivalActivityDetails,
      eq(festivalActivityDetails.id, festivalActivityParticipants.detailsId),
    )
    .innerJoin(
      festivalActivities,
      eq(festivalActivities.id, festivalActivityDetails.activityId),
    )
    .innerJoin(festivals, eq(festivals.id, festivalActivities.festivalId))
    .leftJoin(
      reservationParticipants,
      eq(reservationParticipants.userId, festivalActivityParticipants.userId),
    )
    .leftJoin(
      standReservations,
      and(
        eq(standReservations.id, reservationParticipants.reservationId),
        eq(standReservations.festivalId, festivalActivities.festivalId),
        ne(standReservations.status, "rejected"),
      ),
    )
    .leftJoin(stands, eq(stands.id, standReservations.standId))
    .leftJoin(festivalSectors, eq(festivalSectors.id, stands.festivalSectorId))
    .where(inArray(festivalActivityParticipants.id, uniqueParticipationIds))
    .groupBy(
      festivalActivityParticipants.id,
      users.imageUrl,
      users.displayName,
      users.firstName,
      users.lastName,
    );

  return rows.reduce<Record<number, ParticipationPreviewData>>((acc, row) => {
    const participantName =
      row.displayName ??
      (`${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || null);

    acc[row.participationId] = {
      imageUrl: row.imageUrl ?? null,
      participantName,
      standLabels: row.standLabels,
      sectorName: row.sectorName ?? null,
    };
    return acc;
  }, {});
}
