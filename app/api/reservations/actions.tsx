import { ProfileWithSocials } from "@/app/api/users/definitions";
import { db, pool } from "@/db";
import {
  reservationParticipants,
  standReservations,
  stands,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type Participant = typeof reservationParticipants.$inferSelect & {
  user: ProfileWithSocials;
};
export type ReservationWithParticipantsAndUsers =
  typeof standReservations.$inferSelect & {
    participants: Participant[];
  };

export type ReservationWithParticipantsAndUsersAndStand =
  ReservationWithParticipantsAndUsers & {
    stand: typeof stands.$inferSelect;
  };

export async function fetchReservations(): Promise<
  ReservationWithParticipantsAndUsersAndStand[]
> {
  const client = await pool.connect();

  try {
    return db.query.standReservations.findMany({
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
        stand: true,
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  } finally {
    client.release();
  }
}

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
