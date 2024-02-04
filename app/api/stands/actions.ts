import { Festival } from "@/app/api/festivals/actions";
import { db, pool } from "@/db";
import { participations, standReservations, stands, users } from "@/db/schema";
import { eq } from "drizzle-orm";

type Participation = typeof participations.$inferSelect & {
  user: typeof users.$inferSelect;
};
type StandReservation = typeof standReservations.$inferSelect & {
  participations: Participation[];
};
export type Stand = typeof stands.$inferSelect & {
  reservations: StandReservation[];
  festival: Festival;
};

export async function fetchStandsByFestivalId(
  festivalId: number,
): Promise<Stand[]> {
  const client = await pool.connect();

  try {
    const standsRes = await db.query.stands.findMany({
      where: eq(stands.festivalId, festivalId),
      with: {
        festival: {
          with: {
            userRequests: {
              with: {
                user: true,
              },
            },
          },
        },
        reservations: {
          with: {
            participations: {
              with: {
                user: true,
              },
            },
          },
        },
      },
    });

    return standsRes;
  } catch (error) {
    console.error("Error fetching stands", error);
    return [];
  } finally {
    client.release();
  }
}
