"use server";

import { db } from "@/db";
import {
  externalParticipantTypeEnum,
  externalParticipants,
  reservationExternalParticipants,
  standReservations,
  stands,
} from "@/db/schema";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

function isAcceptedExternalParticipantImageUrl(value?: string) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "utfs.io" ||
        url.hostname === "ufs.sh" ||
        url.hostname.endsWith(".ufs.sh"))
    );
  } catch {
    return false;
  }
}

const ExternalParticipantInputSchema = z.object({
  displayName: z.string().trim().min(2, "El nombre es requerido"),
  type: z.enum(externalParticipantTypeEnum.enumValues),
  customCategoryLabel: z.string().trim().optional(),
  description: z.string().trim().optional(),
  imageUrl: z
    .string()
    .trim()
    .optional()
    .refine(isAcceptedExternalParticipantImageUrl, {
      message: "La imagen debe subirse desde el formulario",
    }),
  websiteUrl: z.url().optional().or(z.literal("")),
  instagramUrl: z.url().optional().or(z.literal("")),
  contactEmail: z
    .email("Ingresá un correo válido")
    .optional()
    .or(z.literal("")),
});

const AssignmentSchema = z.object({
  festivalId: z.coerce.number().int().positive(),
  standId: z.coerce.number().int().positive(),
  externalParticipantId: z.coerce.number().int().positive().optional(),
  externalParticipant: ExternalParticipantInputSchema.optional(),
});

function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

export async function createExternalParticipantReservation(
  input: z.infer<typeof AssignmentSchema>,
): Promise<{ success: boolean; message: string; reservationId?: number }> {
  const currentProfile = await getCurrentUserProfile();
  if (
    !currentProfile ||
    (currentProfile.role !== "admin" &&
      currentProfile.role !== "festival_admin")
  ) {
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
          .values({
            displayName: externalParticipant.displayName,
            type: externalParticipant.type,
            customCategoryLabel: emptyToNull(
              externalParticipant.customCategoryLabel,
            ),
            description: emptyToNull(externalParticipant.description),
            imageUrl: emptyToNull(externalParticipant.imageUrl),
            websiteUrl: emptyToNull(externalParticipant.websiteUrl),
            instagramUrl: emptyToNull(externalParticipant.instagramUrl),
            contactEmail: emptyToNull(externalParticipant.contactEmail),
            createdByUserId: currentProfile.id,
          })
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
