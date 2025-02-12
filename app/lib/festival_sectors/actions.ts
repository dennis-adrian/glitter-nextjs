import { Stand } from "@/app/api/stands/actions";
import { StandBase } from "@/app/api/stands/definitions";
import {
  BaseProfile,
  Participation,
  UserCategory,
} from "@/app/api/users/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { db } from "@/db";
import {
  festivals,
  festivalSectors,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export async function fetchFestivalSectors(
  festivalId: number,
): Promise<FestivalSectorWithStandsWithReservationsWithParticipants[]> {
  try {
    return await db.query.festivalSectors.findMany({
      with: {
        stands: {
          with: {
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
              },
            },
          },
        },
      },
      orderBy: festivalSectors.orderInFestival,
      where: eq(festivalSectors.festivalId, festivalId),
    });
  } catch (error) {
    console.error("Error fetching festival sectors", error);
    return [];
  }
}

export async function fetchFestivalSectorsByUserCategory(
  festivalId: number,
  category: UserCategory,
): Promise<FestivalSectorWithStandsWithReservationsWithParticipants[]> {
  try {
    return await db.transaction(async (tx) => {
      const sectorIds = await tx
        .selectDistinctOn([festivalSectors.id], {
          id: festivalSectors.id,
        })
        .from(festivalSectors)
        .leftJoin(festivals, eq(festivals.id, festivalSectors.festivalId))
        .leftJoin(stands, eq(stands.festivalSectorId, festivalSectors.id))
        .where(
          and(eq(festivals.id, festivalId), eq(stands.standCategory, category)),
        );

      return await db.query.festivalSectors.findMany({
        where: inArray(
          festivalSectors.id,
          sectorIds.map((sector) => sector.id),
        ),
        with: {
          stands: {
            with: {
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
                },
              },
            },
          },
        },
      });
    });
  } catch (error) {
    console.error("Error fetching festival sectors", error);
    return [];
  }
}

export async function fetchConfirmedProfilesByFestivalId(
  festivalId: number,
): Promise<
  (BaseProfile & {
    stands: StandBase[];
    participations: Participation[];
  })[]
> {
  try {
    const res = await db
      .select()
      .from(users)
      .leftJoin(
        reservationParticipants,
        eq(reservationParticipants.userId, users.id),
      )
      .leftJoin(
        standReservations,
        eq(standReservations.id, reservationParticipants.reservationId),
      )
      .leftJoin(stands, eq(stands.id, standReservations.standId))
      .where(
        and(
          eq(standReservations.festivalId, festivalId),
          eq(standReservations.status, "accepted"),
        ),
      );

    const profilesObject = res.reduce(
      (acc, data) => {
        const userId = data.users.id;
        const accStands = acc[userId]?.stands || [];
        const userStand = data.stands;

        const accParticipations = acc[userId]?.participations || [];
        const userParticipation = {
          ...data.participations!,
          reservation: data.stand_reservations!,
        };

        if (userStand) {
          accStands.push(userStand);
          accStands.sort((a, b) => a.standNumber - b.standNumber);
        }

        if (userParticipation) {
          accParticipations.push(userParticipation);
        }

        acc[userId] = {
          ...data.users,
          stands: accStands,
          participations: accParticipations,
        };
        return acc;
      },
      {} as Record<
        number,
        BaseProfile & {
          stands: StandBase[];
          participations: Participation[];
        }
      >,
    );

    return Object.values(profilesObject);
  } catch (error) {
    console.error("Error fetching confirmed profiles", error);
    return [];
  }
}
