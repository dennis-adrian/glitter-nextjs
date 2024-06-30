"use server";

import { and, desc, eq, inArray, isNull, not } from "drizzle-orm";

import { db, pool } from "@/db";
import {
  userRequests,
  festivals,
  stands,
  users,
  reservationParticipants,
  festivalSectors,
} from "@/db/schema";
import {
  Festival,
  FestivalBase,
  FestivalWithDates,
  FestivalWithTickets,
} from "./definitions";
import { sendEmail } from "@/app/vendors/resend";
import React from "react";
import EmailTemplate from "@/app/emails/festival-activation";
import { revalidatePath } from "next/cache";
import { BaseProfile } from "@/app/api/users/definitions";
import { fetchVisitorsEmails } from "@/app/data/visitors/actions";
import RegistrationInvitationEmailTemplate from "@/app/emails/registration-invitation";
import { groupVisitorEmails } from "@/app/data/festivals/helpers";
import { get } from "http";
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
}): Promise<Festival | null | undefined> {
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
        stands: {
          orderBy: (stands.label, stands.standNumber),
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

export async function fetchFestival(
  id: number,
): Promise<FestivalWithTickets | null | undefined> {
  const client = await pool.connect();
  try {
    return await db.query.festivals.findFirst({
      where: eq(festivals.id, id),
      with: {
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

export async function updateFestivalStatus(festival: FestivalBase) {
  const client = await pool.connect();

  try {
    const { status } = festival;
    const [updatedFestival] = await db
      .update(festivals)
      .set({ status })
      .where(eq(festivals.id, festival.id))
      .returning();

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

      const availableUsers = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.verified, true),
            eq(users.banned, false),
            inArray(users.category, categories),
          ),
        );

      availableUsers.forEach(async (user) => {
        await sendEmail({
          to: [user.email],
          from: "Equipo Glitter <no-reply@productoraglitter.com>",
          subject: `¡Hola ${
            user.displayName || ""
          }! Te invitamos a participar en ${festival.name}`,
          react: EmailTemplate({
            name: user.displayName || "Participante",
            festivalId: festival.id,
          }) as React.ReactElement,
        });
      });
    }
  } catch (error) {
    console.error("Error activating festival", error);
    return { success: false, message: "Error al actualizar el festival" };
  } finally {
    client.release();
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
      .returning();

    const visitors = await fetchVisitorsEmails();
    const emailGroups = groupVisitorEmails(visitors);

    if (updatedFestival.publicRegistration) {
      await queueEmails(emailGroups, updatedFestival);
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

export async function queueEmails(
  emailGroups: string[][],
  festival: FestivalBase,
) {
  let counter = 0;
  for (let group of emailGroups) {
    if (counter % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await sendEmailToVisitors(group, festival);
    counter++;
  }
}

export async function sendEmailToVisitors(
  emails: string[],
  festival: FestivalBase,
) {
  const { error } = await sendEmail({
    to: emails,
    from: "Equipo Glitter <equipo@festivalglitter.art>",
    subject: "Pre-registro abierto para nuestro próximo festival",
    react: RegistrationInvitationEmailTemplate({
      festival: festival,
    }) as React.ReactElement,
  });

  if (error) {
    console.error("Error sending email to visitors", error);
  }
}

export async function fetchAvailableArtistsInFestival(
  festivalId: number,
): Promise<BaseProfile[]> {
  const client = await pool.connect();

  try {
    return await db.transaction(async (tx) => {
      return await tx
        .selectDistinctOn([users.id], {
          id: users.id,
          banned: users.banned,
          bio: users.bio,
          birthdate: users.birthdate,
          clerkId: users.clerkId,
          displayName: users.displayName,
          firstName: users.firstName,
          email: users.email,
          imageUrl: users.imageUrl,
          lastName: users.lastName,
          phoneNumber: users.phoneNumber,
          category: users.category,
          role: users.role,
          verified: users.verified,
          updatedAt: users.updatedAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .leftJoin(userRequests, eq(userRequests.userId, users.id))
        .leftJoin(
          reservationParticipants,
          eq(reservationParticipants.userId, users.id),
        )
        .where(
          and(
            eq(users.category, "illustration"),
            not(eq(users.role, "admin")),
            eq(userRequests.status, "accepted"),
            eq(userRequests.festivalId, festivalId),
            isNull(reservationParticipants.id),
          ),
        );
    });
  } catch (error) {
    console.error("Error fetching profiles in festival", error);
    return [];
  } finally {
    client.release();
  }
}
