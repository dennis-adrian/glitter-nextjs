import "server-only";

/**
 * Server-side reads for festival sectors. None of them checks who is asking,
 * and the sector trees carry every occupant's full profile, so they must never
 * sit in a "use server" module, where every export is a public endpoint.
 * Staff screens may render them as they are; anything a participant or a
 * visitor sees goes through `toPublicMapSectors` first.
 */

import { ParticipationType, UserCategory } from "@/app/api/users/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { FullFestival } from "@/app/lib/festivals/definitions";
import { withMembershipReservationsBySector } from "@/app/lib/reservations/stand-occupancy";
import { db } from "@/db";
import {
  festivals,
  festivalSectors,
  profileSubcategories,
  stands,
  standSubcategories,
} from "@/db/schema";
import { and, eq, exists, inArray, notExists, or } from "drizzle-orm";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The profile fields an activity's participant and waitlist rows carry here.
 * The festival reaches client components on participant pages, so they never
 * carry contact or identity data.
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
 * Loaded separately rather than nested in the sector query: Postgres truncates
 * identifiers at 63 characters, and the alias Drizzle generates for this
 * relation four levels down overflows that and breaks the query.
 */
async function attachProfileSubcategories(
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[],
  executor: DbOrTx = db,
): Promise<FestivalSectorWithStandsWithReservationsWithParticipants[]> {
  const userIds = Array.from(
    new Set(
      sectors.flatMap((sector) =>
        sector.stands.flatMap((stand) =>
          stand.reservations.flatMap((reservation) =>
            reservation.participants.map((participant) => participant.user.id),
          ),
        ),
      ),
    ),
  );

  if (userIds.length === 0) return sectors;

  const rows = await executor.query.profileSubcategories.findMany({
    where: inArray(profileSubcategories.profileId, userIds),
    with: { subcategory: true },
  });

  const byProfileId = new Map<number, typeof rows>();
  for (const row of rows) {
    const existing = byProfileId.get(row.profileId);
    if (existing) existing.push(row);
    else byProfileId.set(row.profileId, [row]);
  }

  return sectors.map((sector) => ({
    ...sector,
    stands: sector.stands.map((stand) => ({
      ...stand,
      reservations: stand.reservations.map((reservation) => ({
        ...reservation,
        participants: reservation.participants.map((participant) => ({
          ...participant,
          user: {
            ...participant.user,
            profileSubcategories: byProfileId.get(participant.user.id) ?? [],
          },
        })),
      })),
    })),
  }));
}

/**
 * Every sector of a festival with its stands, every reservation on them
 * (including those not revealed yet) and each occupant's full profile.
 */
export async function fetchFestivalSectors(
  festivalId: number,
): Promise<FestivalSectorWithStandsWithReservationsWithParticipants[]> {
  try {
    const sectors = await db.query.festivalSectors.findMany({
      with: {
        stands: {
          with: {
            // The nested reservation is fetched under its own short alias:
            // Postgres truncates identifiers at 63 bytes, and a deeper chain
            // here collides `_participants` with `_participants_user`.
            reservations: {
              with: {
                participants: {
                  with: {
                    user: {
                      with: {
                        userSocials: true,
                      },
                    },
                  },
                },
                externalParticipants: {
                  with: {
                    externalParticipant: true,
                  },
                },
              },
            },
            // Flat membership; joined to the reservations above in memory.
            reservationMembers: true,
            standSubcategories: {
              with: { subcategory: true },
            },
          },
        },
        mapElements: true,
      },
      orderBy: festivalSectors.orderInFestival,
      where: eq(festivalSectors.festivalId, festivalId),
    });

    const withOccupancy = withMembershipReservationsBySector(sectors);
    try {
      return await attachProfileSubcategories(withOccupancy);
    } catch (error) {
      console.error("Error attaching profile subcategories", error);
      return withOccupancy;
    }
  } catch (error) {
    console.error("Error fetching festival sectors", error);
    return [];
  }
}

export async function fetchFestivalSectorsByUserCategory(
  festivalId: number,
  category: UserCategory,
  subcategoryIds: number[] = [],
  participationType: ParticipationType = "standard",
): Promise<FestivalSectorWithStandsWithReservationsWithParticipants[]> {
  try {
    return await db.transaction(async (tx) => {
      // A stand is visible if it has no subcategory restrictions, OR has a
      // restriction that matches one of the user's subcategories.
      const noRestrictions = notExists(
        tx
          .select()
          .from(standSubcategories)
          .where(eq(standSubcategories.standId, stands.id)),
      );
      const subcategoryFilter =
        subcategoryIds.length > 0
          ? or(
              noRestrictions,
              exists(
                tx
                  .select()
                  .from(standSubcategories)
                  .where(
                    and(
                      eq(standSubcategories.standId, stands.id),
                      inArray(standSubcategories.subcategoryId, subcategoryIds),
                    ),
                  ),
              ),
            )
          : noRestrictions;

      const sectorIds = await tx
        .selectDistinctOn([festivalSectors.id], {
          id: festivalSectors.id,
        })
        .from(festivalSectors)
        .leftJoin(festivals, eq(festivals.id, festivalSectors.festivalId))
        .leftJoin(stands, eq(stands.festivalSectorId, festivalSectors.id))
        .where(
          and(
            eq(festivals.id, festivalId),
            eq(stands.standCategory, category),
            eq(stands.participationType, participationType),
            subcategoryFilter,
          ),
        );

      if (sectorIds.length === 0) return [];

      const sectors = await tx.query.festivalSectors.findMany({
        where: inArray(
          festivalSectors.id,
          sectorIds.map((sector) => sector.id),
        ),
        with: {
          stands: {
            with: {
              // The nested reservation is fetched under its own short alias:
              // Postgres truncates identifiers at 63 bytes, and a deeper chain
              // here collides `_participants` with `_participants_user`.
              reservations: {
                with: {
                  participants: {
                    with: {
                      user: {
                        with: {
                          userSocials: true,
                        },
                      },
                    },
                  },
                  externalParticipants: {
                    with: {
                      externalParticipant: true,
                    },
                  },
                },
              },
              // Flat membership; joined to the reservations above in memory.
              reservationMembers: true,
              standSubcategories: {
                with: { subcategory: true },
              },
            },
          },
          mapElements: true,
        },
      });

      const withOccupancy = withMembershipReservationsBySector(sectors);
      try {
        return await attachProfileSubcategories(withOccupancy, tx);
      } catch (error) {
        console.error("Error attaching profile subcategories", error);
        return withOccupancy;
      }
    });
  } catch (error) {
    console.error("Error fetching festival sectors", error);
    return [];
  }
}

/**
 * A festival with its whole roster: every enrolled profile with its
 * participations, every reservation, and the activities with every
 * participant's proofs and every vote. Participant pages that hand it to
 * client components strip the roster and scope the activities to the profile
 * first (`withoutParticipantRoster`).
 */
export async function fetchFullFestivalById(
  festivalId: number,
): Promise<FullFestival | undefined | null> {
  try {
    return await db.query.festivals.findFirst({
      where: eq(festivals.id, festivalId),
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
              orderBy: (details, { asc }) => [asc(details.id)],
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
    console.error("Error fetching full festival", error);
    return null;
  }
}
