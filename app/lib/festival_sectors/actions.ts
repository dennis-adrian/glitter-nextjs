import { UserCategory } from "@/app/api/users/definitions";
import {
  FestivalSectorBase,
  FestivalSectorWithStandsWithReservationsWithParticipants,
} from "@/app/lib/festival_sectors/definitions";
import { db, pool } from "@/db";
import { festivals, festivalSectors, stands } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export async function fetchFestivalSectors(
  festivalId: number,
): Promise<FestivalSectorWithStandsWithReservationsWithParticipants[]> {
  const client = await pool.connect();

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
  } finally {
    client.release();
  }
}

export async function fetchFestivalSectorsByUserCategory(
  festivalId: number,
  category: UserCategory,
): Promise<FestivalSectorWithStandsWithReservationsWithParticipants[]> {
  const client = await pool.connect();

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
                      user: true,
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
  } finally {
    client.release();
  }
}
