"use server";

import { StandBase } from "@/app/api/stands/definitions";
import {
  BaseProfile,
  Participation,
  UserCategory,
} from "@/app/api/users/definitions";
import {
  ActivityDetailsWithParticipants,
  FestivalActivityWithDetailsAndParticipants,
  FullFestival,
} from "@/app/data/festivals/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { db } from "@/db";
import {
  festivalActivityParticipantProofs,
  festivalActivityParticipants,
  festivals,
  festivalSectors,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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

    let allUsersParticipationsObject: Record<number, Participation[]> = {};

    if (res.length > 0) {
      const allUsersParticipations = await db
        .select()
        .from(reservationParticipants)
        .leftJoin(
          standReservations,
          eq(standReservations.id, reservationParticipants.reservationId),
        )
        .where(
          inArray(
            reservationParticipants.userId,
            res.map((r) => r.users.id),
          ),
        );

      allUsersParticipationsObject = allUsersParticipations.reduce(
        (acc, data) => {
          const participation: Participation = {
            ...data.participations,
            reservation: data.stand_reservations!,
          };
          acc[data.participations.userId] = [
            ...(acc[data.participations.userId] || []),
            participation,
          ];
          return acc;
        },
        {} as Record<number, Participation[]>,
      );
    }

    const profilesObject = res.reduce(
      (acc, data) => {
        const userId = data.users.id;
        const accStands = acc[userId]?.stands || [];
        const userStand = data.stands;

        const accParticipations = acc[userId]?.participations || [];
        const userParticipations = allUsersParticipationsObject[userId];

        if (userStand) {
          accStands.push(userStand);
          accStands.sort((a, b) => a.standNumber - b.standNumber);
        }

        if (accParticipations.length !== userParticipations.length) {
          accParticipations.push(...userParticipations);
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

export async function enrollInActivity(
  userId: number,
  festivalId: number,
  activityDetails: ActivityDetailsWithParticipants,
) {
  try {
    const { id: detailsId, participationLimit } = activityDetails;

    if (participationLimit && participationLimit > 0) {
      // Use a transaction to ensure atomicity
      const result = await db.transaction(async (tx) => {
        // Check if there's space available
        const currentParticipantsCount = await tx
          .select({ count: count() })
          .from(festivalActivityParticipants)
          .where(eq(festivalActivityParticipants.detailsId, detailsId));

        if (currentParticipantsCount[0].count >= participationLimit) {
          return { success: false, message: "Ya no hay cupo disponible" };
        }

        // If there's space, insert the new participant
        await tx.insert(festivalActivityParticipants).values({
          userId,
          detailsId,
        });

        return {
          success: true,
          message: "Inscripción realizada correctamente",
        };
      });

      revalidatePath(`/profiles/${userId}/festivals/${festivalId}/activity`);
      return result;
    } else {
      // If there's no participation limit, just insert
      await db.insert(festivalActivityParticipants).values({
        userId,
        detailsId,
      });

      revalidatePath(`/profiles/${userId}/festivals/${festivalId}/activity`);
      return { success: true, message: "Inscripción realizada correctamente" };
    }
  } catch (error) {
    console.error("Error enrolling in activity", error);
    return { success: false, message: "Error al inscribirse en la actividad" };
  }
}

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
                    reservation: true,
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
              with: {
                participants: {
                  with: {
                    user: true,
                    proofs: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching full festival", error);
    return null;
  }
}

export async function addFestivalActivityParticipantProof(
  participationId: number,
  imageUrls: string[],
) {
  try {
    await db.insert(festivalActivityParticipantProofs).values(
      imageUrls.map((url) => ({
        participationId,
        imageUrl: url,
      })),
    );
  } catch (error) {
    console.error("Error adding festival activity participant proof", error);
    return { success: false, message: "Error al subir el diseño" };
  }

  revalidatePath("/my_profile");
  revalidatePath("/my_participations");
  return { success: true, message: "Diseño subido correctamente" };
}
