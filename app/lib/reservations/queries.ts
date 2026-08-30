import "server-only";

import { and, eq, not } from "drizzle-orm";

import type {
  ReservationWithParticipantsAndUsersAndStandAndCollaborators,
  ReservationWithParticipantsAndUsersAndStandAndFestival,
} from "@/app/api/reservations/definitions";
import {
  PUBLIC_USER_COLUMNS,
  type PublicProfileSummaryDto,
  type ReservationStandRefDto,
} from "@/app/lib/reservations/dto";
import {
  canViewAdminReservationData,
} from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { reservationParticipants, standReservations } from "@/db/schema";

const PUBLIC_SOCIAL_COLUMNS = {
  id: true,
  type: true,
  username: true,
} as const;

export async function fetchPublicFestivalParticipantSummaries(
  festivalId: number,
): Promise<PublicProfileSummaryDto[]> {
  const rows = await db.query.standReservations.findMany({
    where: and(
      eq(standReservations.festivalId, festivalId),
      eq(standReservations.status, "accepted"),
    ),
    columns: { id: true },
    with: {
      participants: {
        columns: { id: true },
        with: {
          user: {
            columns: PUBLIC_USER_COLUMNS,
            with: {
              userSocials: { columns: PUBLIC_SOCIAL_COLUMNS },
            },
          },
        },
      },
    },
  });

  const seen = new Set<number>();
  const summaries: PublicProfileSummaryDto[] = [];
  for (const reservation of rows) {
    for (const participant of reservation.participants) {
      if (seen.has(participant.user.id)) continue;
      seen.add(participant.user.id);
      summaries.push({
        id: participant.user.id,
        displayName: participant.user.displayName,
        imageUrl: participant.user.imageUrl,
        bio: participant.user.bio,
        userSocials: participant.user.userSocials.filter(
          (social) => social.username,
        ),
      });
    }
  }
  return summaries;
}

export async function fetchFestivalReservationStandRefs(
  festivalId: number,
): Promise<ReservationStandRefDto[]> {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];

  const rows = await db.query.standReservations.findMany({
    where: eq(standReservations.festivalId, festivalId),
    columns: { id: true },
    with: {
      stand: {
        columns: { id: true, label: true, standNumber: true },
      },
      participants: {
        columns: { userId: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    stand: row.stand,
    participants: row.participants,
  }));
}

export async function fetchReservationForAdmin(
  id: number,
): Promise<
  ReservationWithParticipantsAndUsersAndStandAndFestival | null | undefined
> {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) return null;

  try {
    return await db.query.standReservations.findFirst({
      where: eq(standReservations.id, id),
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
        festival: {
          with: {
            festivalDates: true,
          },
        },
        scheduledTasks: true,
      },
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchActorReservationsByFestival(
  festivalId: number,
): Promise<ReservationWithParticipantsAndUsersAndStandAndCollaborators[]> {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];

  try {
    const memberships = await db
      .select({ reservationId: reservationParticipants.reservationId })
      .from(reservationParticipants)
      .where(eq(reservationParticipants.userId, actor.id));
    const reservationIds = memberships.map((row) => row.reservationId);
    if (reservationIds.length === 0) return [];

    const rows = await db.query.standReservations.findMany({
      where: and(
        eq(standReservations.festivalId, festivalId),
        not(eq(standReservations.status, "rejected")),
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
        stand: true,
        collaborators: {
          with: {
            collaborator: true,
          },
        },
      },
    });

    return rows.filter((row) => reservationIds.includes(row.id));
  } catch (error) {
    console.error(error);
    return [];
  }
}
