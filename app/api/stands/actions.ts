import { db, pool } from "@/db";
import { stands } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Stand = typeof stands.$inferSelect;
export async function fetchStandsByFestivalId(festivalId: number) {
  const client = await pool.connect();

  try {
    const res = await db.query.stands.findMany({
      where: eq(stands.festivalId, festivalId),
      with: {
        standReservations: {
          with: {
            participations: true,
          },
        },
      },
    });

    return res;
  } catch (error) {
    console.error("Error fetching stands", error);
    return [];
  } finally {
    client.release();
  }
}
