import "server-only";

/**
 * Server-side reads for festival activities. They must never sit in a
 * "use server" module, where every export is a public endpoint. Each one says
 * whom it serves: some check the session themselves, the rest expect callers
 * to authorize first.
 */

import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";

import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { isActivityDetailFullFor } from "@/app/lib/festival_sectors/helpers";
import {
  getCurrentUserProfile,
  requireAdminOrFestivalAdmin,
} from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipants,
  festivalActivityWaitlist,
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
      // Computed from the whole waitlist, before it is narrowed below.
      fullForViewer: isActivityDetailFullFor(activity, detail, viewerId),
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
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Locks a variant's row until `tx` ends and returns it, or undefined when it
 * does not exist. Every writer that takes a seat in a variant (enrolment,
 * waitlist invitation or acceptance, restore, move) locks it before counting,
 * so two of them cannot both count the same last seat.
 *
 * Lock order, to stay free of deadlocks: the participant row a writer moves
 * or restores first, then the variant, then waitlist rows. A transaction
 * never locks two variants.
 *
 * NO KEY UPDATE, not UPDATE: it still excludes the other seat writers and
 * staff edits of the variant, but not the KEY SHARE a foreign-key check
 * takes. Promotions hold it through an email send, and FOR UPDATE would make
 * every vote, participant or invitation pointing at the variant wait for it.
 */
export async function lockVariant(tx: Tx, detailId: number) {
  const [variant] = await tx
    .select({
      id: festivalActivityDetails.id,
      activityId: festivalActivityDetails.activityId,
      participationLimit: festivalActivityDetails.participationLimit,
      category: festivalActivityDetails.category,
    })
    .from(festivalActivityDetails)
    .where(eq(festivalActivityDetails.id, detailId))
    .for("no key update");
  return variant;
}

/**
 * Seats taken in a variant: active participants, and unexpired waitlist
 * invitations holding a seat there. `exceptUserId` leaves out that profile's
 * own invitation, `exceptEntryId` one waitlist entry.
 */
export async function countVariantSeats(
  executor: DbOrTx,
  detailId: number,
  options: { exceptUserId?: number; exceptEntryId?: number } = {},
): Promise<{ activeCount: number; reservedCount: number }> {
  const [{ activeCount }] = await executor
    .select({ activeCount: count() })
    .from(festivalActivityParticipants)
    .where(
      and(
        eq(festivalActivityParticipants.detailsId, detailId),
        isNull(festivalActivityParticipants.removedAt),
      ),
    );
  const [{ reservedCount }] = await executor
    .select({ reservedCount: count() })
    .from(festivalActivityWaitlist)
    .where(
      and(
        eq(festivalActivityWaitlist.notifiedForDetailId, detailId),
        gt(festivalActivityWaitlist.expiresAt, new Date()),
        options.exceptUserId !== undefined
          ? ne(festivalActivityWaitlist.userId, options.exceptUserId)
          : undefined,
        options.exceptEntryId !== undefined
          ? ne(festivalActivityWaitlist.id, options.exceptEntryId)
          : undefined,
      ),
    );
  return { activeCount, reservedCount };
}

/**
 * Condition on a `festivalActivityWaitlist` query: the entry's profile has no
 * participation, active or removed, in any variant of the activity. A removal
 * bars the whole activity, and an enrolled profile's entry (one left behind by
 * an older enrolment) could never be accepted.
 */
export function notInActivity(activityId: number) {
  return sql`NOT EXISTS (
    SELECT 1
    FROM ${festivalActivityParticipants}
    INNER JOIN ${festivalActivityDetails}
      ON ${festivalActivityDetails.id} = ${festivalActivityParticipants.detailsId}
    WHERE ${festivalActivityDetails.activityId} = ${activityId}
      AND ${festivalActivityParticipants.userId} = ${festivalActivityWaitlist.userId}
  )`;
}

/**
 * Waitlist entries due an invitation to a seat in a variant of `category`
 * (null: any category): not yet invited, and with no participation in any
 * variant of the activity (see `notInActivity`). `exceptUserId` leaves out
 * that profile's own entry. The query must join `users` on the entry's
 * userId. Waitlist promotion claims from these, and self-enrolment yields to
 * them, so both use this one predicate.
 */
export function eligibleWaitlistEntries(
  activityId: number,
  category: (typeof users.$inferSelect)["category"] | null,
  options: { exceptUserId?: number } = {},
) {
  return and(
    eq(festivalActivityWaitlist.activityId, activityId),
    isNull(festivalActivityWaitlist.notifiedAt),
    category ? eq(users.category, category) : undefined,
    options.exceptUserId !== undefined
      ? ne(festivalActivityWaitlist.userId, options.exceptUserId)
      : undefined,
    notInActivity(activityId),
  )!;
}

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
