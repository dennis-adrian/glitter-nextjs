"use server";

import { desc, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { userRequests, festivals, stands, users } from "@/db/schema";
import { Festival, FestivalBase, FestivalWithTickets } from "./definitions";
import { sendEmail } from "@/vendors/resend";
import React from "react";
import EmailTemplate from "@/app/emails/festival-activation";
import { revalidatePath } from "next/cache";

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

export async function activateFestival(festival: FestivalBase) {
  const client = await pool.connect();

  try {
    const verifiedUsers = await db.transaction(async (tx) => {
      await tx
        .update(festivals)
        .set({
          status: "active",
        })
        .where(eq(festivals.id, festival.id));

      return await tx.select().from(users).where(eq(users.verified, true));
    });

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
  } catch (error) {
    console.error("Error activating festival", error);
    return { success: false, message: "Error al activar el festival" };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/festivals");
  return { success: true, message: "Festival activado con éxito" };
}
