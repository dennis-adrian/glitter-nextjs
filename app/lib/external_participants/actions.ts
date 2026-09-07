"use server";

import { db } from "@/db";
import { externalParticipants } from "@/db/schema";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createExternalParticipantReservation as assignExternalParticipantReservation } from "@/app/lib/reservations/capacity-service";

import {
  externalParticipantInputSchema,
  ExternalParticipantInput,
} from "./schema";
import type { ExternalParticipant } from "./definitions";

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

export async function createExternalParticipantReservation(input: unknown) {
  return assignExternalParticipantReservation(input);
}
