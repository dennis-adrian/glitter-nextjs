"use server";

import { and, desc, eq, isNull, not } from "drizzle-orm";

import { db, pool } from "@/db";
import {
  userRequests,
  festivals,
  stands,
  users,
  reservationParticipants,
} from "@/db/schema";
import { Festival, FestivalBase, FestivalWithTickets } from "./definitions";
import { sendEmail } from "@/app/vendors/resend";
import React from "react";
import EmailTemplate from "@/app/emails/festival-activation";
import { revalidatePath } from "next/cache";
import { BaseProfile } from "@/app/api/users/definitions";
import { fetchVisitorsEmails } from "@/app/data/visitors/actions";
import RegistrationInvitationEmailTemplate from "@/app/emails/registration-invitation";
import { groupVisitorEmails } from "@/app/data/festivals/helpers";

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

export async function fetchFestivals(): Promise<FestivalBase[]> {
  const client = await pool.connect();

  try {
    return await db.query.festivals.findMany({
      orderBy: desc(festivals.id),
    });
  } catch (error) {
    console.error("Error fetching festivals", error);
    return [] as FestivalBase[];
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
      const verifiedUsers = await db
        .select()
        .from(users)
        .where(eq(users.verified, true));

      const entrepreneurs = verifiedUsers.filter(
        (user) => user.category === "entrepreneurship",
      );
      const illustrators = verifiedUsers.filter(
        (user) => user.category === "illustration",
      );
      const gastronmics = verifiedUsers.filter(
        (user) => user.category === "gastronomy",
      );

      entrepreneurs.forEach(async (user) => {
        await sendEmail({
          to: [user.email],
          from: "Equipo Glitter <no-reply@festivalglitter.art>",
          subject: "Participa en Glitter",
          react: EmailTemplate({
            category: "entrepreneurship",
            name: user.displayName || "Emprendedor",
            festivalId: festival.id,
          }) as React.ReactElement,
        });
      });

      illustrators.forEach(async (user) => {
        await sendEmail({
          to: [user.email],
          from: "Equipo Glitter <no-reply@festivalglitter.art>",
          subject: "Participa en Glitter",
          react: EmailTemplate({
            category: "illustration",
            name: user.displayName || "Ilustrador",
            festivalId: festival.id,
          }) as React.ReactElement,
        });
      });

      gastronmics.forEach(async (user) => {
        await sendEmail({
          to: [user.email],
          from: "Equipo Glitter <no-reply@festivalglitter.art>",
          subject: "Participa en Glitter",
          react: EmailTemplate({
            category: "gastronomy",
            name: user.displayName || "Emprendedor Gastronómico",
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

    emailGroups.forEach(async (visitorEmails) => {
      await sendEmailToVisitors(visitorEmails, updatedFestival);
    });
  } catch (error) {
    console.error("Error updating festival registration", error);
    return { success: false, message: "Error al actualizar el festival" };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/festivals");
  return { success: true, message: "Festival actualizado con éxito" };
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
