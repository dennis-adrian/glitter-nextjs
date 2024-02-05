import { ProfileWithSocials } from "@/app/api/users/definitions";
import { db, pool } from "@/db";
import { reservationParticipants, standReservations } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type Participant = typeof reservationParticipants.$inferSelect & {
  user: ProfileWithSocials;
};
export type ReservationWithParticipantsAndUsers = {
  participants: Participant[];
};

export async function fetchConfirmedReservationsByFestival(
  festivalId: number,
): Promise<ReservationWithParticipantsAndUsers[]> {
  const client = await pool.connect();

  try {
    return db.query.standReservations.findMany({
      where: and(
        eq(standReservations.festivalId, festivalId),
        eq(standReservations.status, "accepted"),
      ),
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
    });
  } catch (error) {
    console.error(error);
    return [];
  } finally {
    client.release();
  }
}
