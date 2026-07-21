"use server";

import { db } from "@/db";
import {
  externalParticipants,
  reservationExternalParticipants,
  standReservations,
  stands,
} from "@/db/schema";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  externalParticipantInputSchema,
  ExternalParticipantInput,
} from "./schema";
import type { ExternalParticipant } from "./definitions";

const AssignmentSchema = z
  .object({
    festivalId: z.coerce.number().int().positive(),
    standId: z.coerce.number().int().positive(),
    externalParticipantId: z.coerce.number().int().positive().optional(),
    externalParticipant: externalParticipantInputSchema.optional(),
    // Moment before which the reservation stays hidden from participants.
    // Omit (undefined) to fall back to the festival's reservation start date;
    // pass null to make the reservation visible immediately.
    revealAt: z.coerce.date().nullish(),
  })
  .refine(
    (data) => {
      const hasId = data.externalParticipantId != null;
      const hasNew = data.externalParticipant != null;
      return hasId !== hasNew;
    },
    {
      message:
        "Indicá un participante existente o los datos de uno nuevo, no ambos",
    },
  );

export type FetchExternalParticipantResult =
  | { found: true; participant: ExternalParticipant }
  | { found: false }
  | { error: Error };

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

function logExternalParticipantError(
  operation: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  console.error(`[external_participants] ${operation} failed`, {
    ...context,
    ...(error instanceof Error
      ? { name: error.name, message: error.message }
      : { message: "Unknown error" }),
  });
}

async function deleteOrphanImage(
  url: string | null | undefined,
  logLabel: string,
) {
  if (!url) return;

  const deleteResult = await deleteFile(url);
  if (!deleteResult.success) {
    console.error(logLabel, { error: deleteResult.error });
  }
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
    logExternalParticipantError("fetchExternalParticipants", error);
    return [];
  }
}

export async function fetchExternalParticipant(
  id: number,
): Promise<FetchExternalParticipantResult> {
  try {
    const currentProfile = await requireExternalParticipantManager();
    if (!currentProfile) {
      return { found: false };
    }

    const participant = await db.query.externalParticipants.findFirst({
      where: eq(externalParticipants.id, id),
    });
    if (!participant) {
      return { found: false };
    }
    return { found: true, participant };
  } catch (error) {
    logExternalParticipantError("fetchExternalParticipant", error, {
      participantId: id,
    });
    return {
      error:
        error instanceof Error
          ? error
          : new Error("Unexpected error while fetching external participant."),
    };
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
      .values(mapExternalParticipantInput(parsed.data, currentProfile.id))
      .returning({ id: externalParticipants.id });

    revalidatePath("/dashboard/external_participants");
    revalidatePath("/", "layout");

    return {
      success: true,
      message: "Participante externo creado",
      id: created.id,
    };
  } catch (error) {
    await deleteOrphanImage(
      parsed.data.imageUrl,
      "Failed to delete uploaded image after create failure",
    );
    logExternalParticipantError("createExternalParticipant", error);
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

  const newImageUrl = emptyToNull(parsed.data.imageUrl);
  let previousImageUrl: string | null = null;
  let existingImageUrl: string | null = null;

  try {
    const existing = await db.query.externalParticipants.findFirst({
      where: eq(externalParticipants.id, id),
    });

    if (!existing) {
      return { success: false, message: "El participante externo no existe" };
    }

    existingImageUrl = existing.imageUrl;
    if (existing.imageUrl && existing.imageUrl !== newImageUrl) {
      previousImageUrl = existing.imageUrl;
    }

    await db
      .update(externalParticipants)
      .set(mapExternalParticipantInput(parsed.data))
      .where(eq(externalParticipants.id, id));

    if (previousImageUrl) {
      await deleteOrphanImage(
        previousImageUrl,
        "Failed to delete replaced external participant image",
      );
    }

    revalidatePath("/dashboard/external_participants");
    revalidatePath(`/dashboard/external_participants/${id}/edit`);
    revalidatePath("/", "layout");

    return {
      success: true,
      message: "Participante externo actualizado",
    };
  } catch (error) {
    if (newImageUrl && newImageUrl !== existingImageUrl) {
      await deleteOrphanImage(
        newImageUrl,
        "Failed to delete uploaded image after update failure",
      );
    }
    logExternalParticipantError("updateExternalParticipant", error, {
      participantId: id,
    });
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
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const { festivalId, standId, externalParticipantId, externalParticipant } =
    parsed.data;

  const festival = await fetchBaseFestival(festivalId);
  if (!festival) {
    return { success: false, message: "El festival no existe" };
  }
  const revealAt =
    parsed.data.revealAt === undefined
      ? festival.reservationsStartDate
      : parsed.data.revealAt;

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
            mapExternalParticipantInput(externalParticipant, currentProfile.id),
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
          revealAt,
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

    if (externalParticipant?.imageUrl) {
      await deleteOrphanImage(
        externalParticipant.imageUrl,
        "Failed to delete uploaded image after reservation create failure",
      );
    }

    logExternalParticipantError("createExternalParticipantReservation", error, {
      festivalId,
      standId,
    });
    return {
      success: false,
      message: "Ups! No pudimos crear la reserva externa",
    };
  }
}
