"use server";

import { and, desc, eq, inArray, isNull, not, sql } from "drizzle-orm";

import { db, pool } from "@/db";
import {
  userRequests,
  festivals,
  users,
  reservationParticipants,
  festivalSectors,
  standReservations,
  profileSubcategories,
  tickets,
  userSocials,
} from "@/db/schema";
import {
  FullFestival,
  Festival,
  FestivalBase,
  FestivalWithDates,
  FestivalWithTicketsAndDates,
} from "./definitions";
import { sendEmail } from "@/app/vendors/resend";
import React from "react";
import EmailTemplate from "@/app/emails/festival-activation";
import { revalidatePath } from "next/cache";
import {
  BaseProfile,
  ParticipationWithParticipantAndReservations,
} from "@/app/api/users/definitions";
import { fetchVisitorsEmails } from "@/app/data/visitors/actions";
import RegistrationInvitationEmailTemplate from "@/app/emails/registration-invitation";
import { groupVisitorEmails } from "@/app/data/festivals/helpers";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";

export async function fetchActiveFestivalBase() {
  const client = await pool.connect();

  try {
    return await db.query.festivals.findFirst({
      where: eq(festivals.status, "active"),
    });
  } catch (error) {
    console.error("Error fetching active festival", error);
    return null;
  } finally {
    client.release();
  }
}

export async function fetchActiveFestival({
  acceptedUsersOnly = false,
  id,
}: {
  acceptedUsersOnly?: boolean;
  id?: number;
}): Promise<FullFestival | null | undefined> {
  const client = await pool.connect();

  const whereCondition = acceptedUsersOnly
    ? { where: eq(userRequests.status, "accepted") }
    : {};

  const festivalWhereCondition = id
    ? { where: eq(festivals.id, id) }
    : { where: eq(festivals.status, "active") };

  try {
    return await db.query.festivals.findFirst({
      ...festivalWhereCondition,
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
          ...whereCondition,
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
    console.error("Error fetching active festival", error);
    return null;
  } finally {
    client.release();
  }
}

export async function fetchFestivalWithTicketsAndDates(
  id: number,
): Promise<FestivalWithTicketsAndDates | null | undefined> {
  const client = await pool.connect();
  try {
    return await db.query.festivals.findFirst({
      where: eq(festivals.id, id),
      with: {
        festivalDates: true,
        tickets: {
          with: {
            visitor: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching active festival", error);
    return null;
  } finally {
    client.release();
  }
}

export async function fetchBaseFestival(
  id: number,
): Promise<FestivalBase | null | undefined> {
  const client = await pool.connect();
  try {
    return await db.query.festivals.findFirst({
      where: eq(festivals.id, id),
    });
  } catch (error) {
    console.error("Error fetching active festival", error);
    return null;
  } finally {
    client.release();
  }
}

export async function fetchFestivalWithDates(
  id: number,
): Promise<FestivalWithDates | null | undefined> {
  const client = await pool.connect();
  try {
    return await db.query.festivals.findFirst({
      with: {
        festivalDates: true,
      },
      where: eq(festivals.id, id),
    });
  } catch (error) {
    console.error("Error fetching active festival", error);
    return null;
  } finally {
    client.release();
  }
}

export async function fetchFestivals(): Promise<FestivalWithDates[]> {
  const client = await pool.connect();

  try {
    return await db.query.festivals.findMany({
      with: {
        festivalDates: true,
      },
      orderBy: desc(festivals.id),
    });
  } catch (error) {
    console.error("Error fetching festivals", error);
    return [];
  } finally {
    client.release();
  }
}

// TODO: Improve this by running actions in the background
// ------ BEGIN
export async function updateFestivalStatusTemp(festival: FestivalBase) {
  try {
    await db
      .update(festivals)
      .set({ status: festival.status })
      .where(eq(festivals.id, festival.id));
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al actualizar el festival" };
  }

  revalidatePath("/dashboard/festivals");
  return { success: true, message: "Festival actualizado con éxito" };
}

export async function getFestivalAvailableUsers(festivalId: number) {
  try {
    const sectors = await db.query.festivalSectors.findMany({
      with: {
        stands: true,
      },
      where: eq(festivalSectors.festivalId, festivalId),
    });

    const categories = [
      ...new Set(
        sectors.flatMap((sector) =>
          getFestivalSectorAllowedCategories(sector, true),
        ),
      ),
    ];

    const result = await db
      .select()
      .from(users)
      .innerJoin(
        profileSubcategories,
        eq(users.id, profileSubcategories.profileId),
      )
      .where(
        and(eq(users.status, "verified"), inArray(users.category, categories)),
      );

    return result.map((result) => result.users);
  } catch (error) {
    console.error(error);
    return [];
  }
}
export async function sendUserEmailsTemp(
  users: BaseProfile[],
  festivalId: number,
) {
  try {
    const festivalWithDates = await fetchFestivalWithDates(festivalId);
    await queueEmails<BaseProfile>(users, festivalWithDates!, sendEmailToUsers);
  } catch (error) {}
}
// ------ END

export async function updateFestivalStatus(festival: FestivalBase) {
  try {
    const { status } = festival;
    const [updatedFestival] = await db
      .update(festivals)
      .set({ status })
      .where(eq(festivals.id, festival.id))
      .returning();

    const festivalWithDates = await fetchFestivalWithDates(updatedFestival.id);

    if (updatedFestival.status === "active") {
      const sectors = await db.query.festivalSectors.findMany({
        with: {
          stands: true,
        },
        where: eq(festivalSectors.festivalId, festival.id),
      });

      const categories = [
        ...new Set(
          sectors.flatMap((sector) =>
            getFestivalSectorAllowedCategories(sector, true),
          ),
        ),
      ];

      const result = await db
        .select()
        .from(users)
        .innerJoin(
          profileSubcategories,
          eq(users.id, profileSubcategories.profileId),
        )
        .where(
          and(
            eq(users.status, "verified"),
            inArray(users.category, categories),
          ),
        );

      const availableUsers = result.map((result) => result.users);

      await queueEmails<BaseProfile>(
        availableUsers,
        festivalWithDates!,
        sendEmailToUsers,
      );
    }
  } catch (error) {
    console.error("Error activating festival", error);
    return { success: false, message: "Error al actualizar el festival" };
  }

  revalidatePath("/dashboard/festivals");
  return { success: true, message: "Festival actualizado con éxito" };
}

export async function updateFestivalRegistration(festival: FestivalBase) {
  const client = await pool.connect();

  try {
    const { publicRegistration } = festival;
    const [updatedFestival] = await db
      .update(festivals)
      .set({ publicRegistration })
      .where(eq(festivals.id, festival.id))
      .returning({ festivalId: festivals.id });

    const festivalWithDates = await fetchFestivalWithDates(
      updatedFestival.festivalId,
    );

    const visitors = await fetchVisitorsEmails();
    const emailGroups = groupVisitorEmails(visitors);

    if (festivalWithDates?.publicRegistration) {
      await queueEmails<string[]>(
        emailGroups,
        festivalWithDates,
        sendEmailToVisitors,
      );
    }
  } catch (error) {
    console.error("Error updating festival registration", error);
    return { success: false, message: "Error al actualizar el festival" };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/festivals");
  return { success: true, message: "Festival actualizado con éxito" };
}

export async function updateFestival(festival: FestivalBase) {
  const client = await pool.connect();

  try {
    await db
      .update(festivals)
      .set(festival)
      .where(eq(festivals.id, festival.id))
      .returning();
  } catch (error) {
    console.error("Error updating festival", error);
    return { success: false, message: "Error al actualizar el festival" };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/festivals");
  return { success: true, message: "Festival actualizado con éxito" };
}

export async function queueEmails<T>(
  entities: T[],
  festival: FestivalWithDates,
  callback: (entity: T, festival: FestivalWithDates) => Promise<void>,
) {
  let counter = 0;
  for (let entity of entities) {
    if (counter % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await callback(entity, festival);
    counter++;
  }
}

export async function sendEmailToVisitors(
  emails: string[],
  festival: FestivalWithDates,
) {
  const { error } = await sendEmail({
    to: emails,
    from: "Equipo Glitter <equipo@productoraglitter.com>",
    subject: "Pre-registro abierto para nuestro próximo festival",
    react: RegistrationInvitationEmailTemplate({
      festival: festival,
    }) as React.ReactElement,
  });
  if (error) {
    console.error("Error sending email to visitors", error);
  }
}

export async function sendEmailToUsers(
  user: BaseProfile,
  festival: FestivalWithDates,
) {
  const { error } = await sendEmail({
    to: [user.email],
    from: "Productora Glitter <no-reply@productoraglitter.com>",
    subject: `¡Hola ${user.displayName || ""}! Te invitamos a participar en ${
      festival.name
    }`,
    react: EmailTemplate({
      profile: user,
      festival: festival,
    }) as React.ReactElement,
  });
  if (error) {
    console.error("Error sending email to users", error);
  }
}

export async function fetchAvailableArtistsInFestival(
  festivalId: number,
): Promise<BaseProfile[]> {
  const client = await pool.connect();

  try {
    return await db.transaction(async (tx) => {
      const festivalParticipantIds = await tx
        .select({ participantId: reservationParticipants.userId })
        .from(reservationParticipants)
        .leftJoin(
          standReservations,
          eq(standReservations.id, reservationParticipants.reservationId),
        )
        .where(eq(standReservations.festivalId, festivalId));

      const participantsWhereCondition = [
        eq(users.status, "verified"),
        inArray(users.category, ["illustration", "new_artist"]),
        not(eq(users.role, "admin")),
        eq(userRequests.status, "accepted"),
        eq(userRequests.festivalId, festivalId),
      ];

      if (festivalParticipantIds.length > 0) {
        participantsWhereCondition.push(
          not(
            inArray(
              users.id,
              festivalParticipantIds.map(
                (participant) => participant.participantId,
              ),
            ),
          ),
        );
      }

      return await tx
        .selectDistinctOn([users.id], {
          id: users.id,
          bio: users.bio,
          birthdate: users.birthdate,
          clerkId: users.clerkId,
          displayName: users.displayName,
          firstName: users.firstName,
          gender: users.gender,
          email: users.email,
          imageUrl: users.imageUrl,
          lastName: users.lastName,
          phoneNumber: users.phoneNumber,
          category: users.category,
          role: users.role,
          status: users.status,
          state: users.state,
          verifiedAt: users.verifiedAt,
          updatedAt: users.updatedAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .leftJoin(userRequests, eq(userRequests.userId, users.id))
        .leftJoin(
          reservationParticipants,
          eq(reservationParticipants.userId, users.id),
        )
        .where(and(...participantsWhereCondition));
    });
  } catch (error) {
    console.error("Error fetching profiles in festival", error);
    return [];
  } finally {
    client.release();
  }
}

export async function fetchFestivalParticipants(
  festivalId: number,
): Promise<ParticipationWithParticipantAndReservations[]> {
  try {
    const queryResult = await db
      .select()
      .from(reservationParticipants)
      .leftJoin(
        standReservations,
        eq(standReservations.id, reservationParticipants.reservationId),
      )
      .leftJoin(users, eq(users.id, reservationParticipants.userId))
      .where(eq(standReservations.festivalId, festivalId));

    const formattedResult = queryResult.map((res) => ({
      ...res.participations,
      user: res.users,
      reservation: res.stand_reservations,
    }));

    return formattedResult as ParticipationWithParticipantAndReservations[];
  } catch (error) {
    console.error("Error fetching festival participants", error);
    return [];
  }
}

export async function fetchEnrolledParticipants(
  festivalId: number,
): Promise<BaseProfile[]> {
  try {
    const participantsWithReservationsSubquery = db
      .select({ userId: reservationParticipants.userId })
      .from(reservationParticipants)
      .leftJoin(
        standReservations,
        eq(standReservations.id, reservationParticipants.reservationId),
      )
      .where(
        and(
          eq(standReservations.festivalId, festivalId),
          not(eq(standReservations.status, "rejected")),
        ),
      );

    const queryResult = await db
      .selectDistinctOn([userRequests.userId], {
        users: users,
      })
      .from(userRequests)
      .leftJoin(users, eq(users.id, userRequests.userId))
      .where(
        and(
          eq(userRequests.type, "festival_participation"),
          eq(userRequests.festivalId, festivalId),
          not(
            inArray(
              userRequests.userId,
              // --- SQL Query equivalent to the subquery
              // sql`(
              //   select participations.user_id from participations
              //   left join stand_reservations on participations.reservation_id = stand_reservations.id
              //   where stand_reservations.festival_id = ${festivalId} and stand_reservations.status != 'rejected'
              // )`,
              participantsWithReservationsSubquery,
            ),
          ),
        ),
      );

    return queryResult
      .map((userRequest) => userRequest.users)
      .filter((user): user is NonNullable<typeof user> => user !== null);
  } catch (error) {
    console.error(error);
    return [];
  }
}
