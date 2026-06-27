"use server";

import { db } from "@/db";
import {
  externalParticipants,
  reservationExternalParticipants,
  standReservations,
  stands,
} from "@/db/schema";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  externalParticipantInputSchema,
  ExternalParticipantInput,
} from "./schema";

const AssignmentSchema = z.object({
  festivalId: z.coerce.number().int().positive(),
  standId: z.coerce.number().int().positive(),
  externalParticipantId: z.coerce.number().int().positive().optional(),
  externalParticipant: externalParticipantInputSchema.optional(),
});

function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapExternalParticipantInput(
  input: ExternalParticipantInput,
  createdByUserId?: number,
) {
  return {
    displayName: input.displayName,
    type: input.type,
    customCategoryLabel: emptyToNull(input.customCategoryLabel),
    description: emptyToNull(input.description),
    imageUrl: emptyToNull(input.imageUrl),
    websiteUrl: emptyToNull(input.websiteUrl),
    instagramUrl: emptyToNull(input.instagramUrl),
    contactEmail: emptyToNull(input.contactEmail),
    contactPhone: emptyToNull(input.contactPhone),
    ...(createdByUserId !== undefined
      ? { createdByUserId }
      : { updatedAt: new Date() }),
  };
}

async function requireExternalParticipantManager() {
  const currentProfile = await getCurrentUserProfile();
  if (
    !currentProfile ||
    (currentProfile.role !== "admin" &&
      currentProfile.role !== "festival_admin")
  ) {
    return null;
  }
  return currentProfile;
}

export async function fetchExternalParticipants() {
  try {
    return await db.query.externalParticipants.findMany({
      orderBy: (externalParticipants, { asc }) => [
        asc(externalParticipants.displayName),
      ],
    });
  } catch (error) {
    console.error("Error fetching external participants", error);
    return [];
  }
}

export async function fetchExternalParticipant(id: number) {
  try {
    return await db.query.externalParticipants.findFirst({
      where: eq(externalParticipants.id, id),
    });
  } catch (error) {
    console.error("Error fetching external participant", error);
    return null;
  }
}

export async function createExternalParticipant(
  input: ExternalParticipantInput,
): Promise<{ success: boolean; message: string; id?: number }> {
  const currentProfile = await requireExternalParticipantManager();
  if (!currentProfile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  const parsed = externalParticipantInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" };
  }

  try {
    const [created] = await db
      .insert(externalParticipants)
      .values(
        mapExternalParticipantInput(parsed.data, currentProfile.id),
      )
      .returning({ id: externalParticipants.id });

    revalidatePath("/dashboard/external_participants");
    revalidatePath("/", "layout");

    return {
      success: true,
      message: "Participante externo creado",
      id: created.id,
    };
  } catch (error) {
    console.error("Error creating external participant", error);
    return {
      success: false,
      message: "No se pudo crear el participante externo",
    };
  }
}

export async function updateExternalParticipant(
  id: number,
  input: ExternalParticipantInput,
): Promise<{ success: boolean; message: string }> {
  const currentProfile = await requireExternalParticipantManager();
  if (!currentProfile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  const parsed = externalParticipantInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" };
  }

  try {
    const existing = await db.query.externalParticipants.findFirst({
      where: eq(externalParticipants.id, id),
    });

    if (!existing) {
      return { success: false, message: "El participante externo no existe" };
    }

    await db
      .update(externalParticipants)
      .set(mapExternalParticipantInput(parsed.data))
      .where(eq(externalParticipants.id, id));

    revalidatePath("/dashboard/external_participants");
    revalidatePath(`/dashboard/external_participants/${id}/edit`);
    revalidatePath("/", "layout");

    return {
      success: true,
      message: "Participante externo actualizado",
    };
  } catch (error) {
    console.error("Error updating external participant", error);
    return {
      success: false,
      message: "No se pudo actualizar el participante externo",
    };
  }
}

export async function createExternalParticipantReservation(
  input: z.infer<typeof AssignmentSchema>,
): Promise<{ success: boolean; message: string; reservationId?: number }> {
  const currentProfile = await requireExternalParticipantManager();
  if (!currentProfile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  const parsed = AssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Datos inválidos",
    };
  }

  const { festivalId, standId, externalParticipantId, externalParticipant } =
    parsed.data;

  if (!externalParticipantId && !externalParticipant) {
    return {
      success: false,
      message: "Seleccioná o creá un participante externo",
    };
  }

  try {
    const reservationId = await db.transaction(async (tx) => {
      const [lockedStand] = await tx
        .select()
        .from(stands)
        .where(and(eq(stands.id, standId), eq(stands.festivalId, festivalId)))
        .limit(1)
        .for("update");

      if (!lockedStand) {
        throw new Error("STAND_NOT_FOUND");
      }

      if (lockedStand.status !== "available") {
        throw new Error("STAND_NOT_AVAILABLE");
      }

      let participantId = externalParticipantId;

      if (participantId) {
        const existing = await tx.query.externalParticipants.findFirst({
          where: eq(externalParticipants.id, participantId),
        });
        if (!existing) {
          throw new Error("EXTERNAL_PARTICIPANT_NOT_FOUND");
        }
      } else if (externalParticipant) {
        const [created] = await tx
          .insert(externalParticipants)
          .values(
            mapExternalParticipantInput(
              externalParticipant,
              currentProfile.id,
            ),
          )
          .returning({ id: externalParticipants.id });

        participantId = created.id;
      }

      if (!participantId) {
        throw new Error("EXTERNAL_PARTICIPANT_REQUIRED");
      }

      const [reservation] = await tx
        .insert(standReservations)
        .values({
          festivalId,
          standId,
          status: "accepted",
          source: "admin_assignment",
        })
        .returning({ id: standReservations.id });

      await tx.insert(reservationExternalParticipants).values({
        externalParticipantId: participantId,
        reservationId: reservation.id,
      });

      await tx
        .update(stands)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(stands.id, standId));

      return reservation.id;
    });

    revalidatePath("/dashboard/external_participants");
    revalidatePath("/dashboard/festivals");
    revalidatePath("/dashboard/reservations");
    revalidatePath(`/dashboard/festivals/${festivalId}`);
    revalidatePath(`/dashboard/festivals/${festivalId}/reservations`);
    revalidatePath("/", "layout");

    return {
      success: true,
      message: "Reserva externa creada",
      reservationId,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "STAND_NOT_FOUND") {
        return { success: false, message: "El espacio no existe" };
      }
      if (error.message === "STAND_NOT_AVAILABLE") {
        return {
          success: false,
          message: "El espacio no está disponible",
        };
      }
      if (error.message === "EXTERNAL_PARTICIPANT_NOT_FOUND") {
        return {
          success: false,
          message: "El participante externo no existe",
        };
      }
    }

    console.error("Error creating external participant reservation", error);
    return {
      success: false,
      message: "Ups! No pudimos crear la reserva externa",
    };
  }
}
