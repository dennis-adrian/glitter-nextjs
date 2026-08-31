import "server-only";

import { eq } from "drizzle-orm";

import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import { lockReservationAggregate } from "@/app/lib/reservations/locks";
import { standHasLiveOccupancy } from "@/app/lib/reservations/occupancy";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import {
  createExternalReservationSchema,
  parseUnknown,
} from "@/app/lib/reservations/schemas";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  externalParticipants,
  reservationExternalParticipants,
  standReservations,
  stands,
} from "@/db/schema";
import { revalidatePath } from "next/cache";

import type { ExternalParticipantInput } from "@/app/lib/external_participants/schema";

/**
 * Canonical Phase 0 external assignment writer.
 *
 * Current `stand_reservations.stand_id` is the single occupancy member. When
 * the paid-reservation PRD introduces `stand_reservation_stands`, this writer
 * will insert exactly one member row for that `stand_id` in the same
 * transaction. Do not add a second occupancy insert here.
 *
 * Mutation inventory (live writers of reservation occupancy/settlement):
 * - `hold-service.ts`: stand_holds create/replace/cancel/confirm
 * - `admin-actions.ts#createAdminReservation`: stand_reservations + invoices
 * - `admin-service.ts`: partner rows, cancellation, deadline
 * - `payment-service.ts`: invoices/payments/settlements
 * - this module: external stand_reservations + reservation_external_participants
 * - enrollment review does not write reservation occupancy
 */
function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapExternalParticipantInput(
  input: ExternalParticipantInput,
  createdByUserId: number,
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
    createdByUserId,
  };
}

export async function createExternalParticipantReservation(
  input: unknown,
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

  const parsed = parseUnknown(createExternalReservationSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  const {
    festivalId,
    standId,
    idempotencyKey,
    externalParticipantId,
    externalParticipant,
  } = parsed.data;

  const festival = await fetchBaseFestival(festivalId);
  if (!festival) {
    return { success: false, message: "El festival no existe" };
  }
  const revealAt =
    parsed.data.revealAt === undefined
      ? festival.reservationsStartDate
      : parsed.data.revealAt;

  try {
    const result = await db.transaction(async (tx) => {
      const claim = await claimRequest(tx, {
        requestKey: idempotencyKey,
        operation: "createExternalParticipantReservation",
        actorUserId: currentProfile.id,
        scope: {
          festivalId,
          standId,
          externalParticipantId: externalParticipantId ?? null,
          displayName: externalParticipant?.displayName ?? null,
          revealAt: revealAt instanceof Date ? revealAt.toISOString() : null,
        },
      });
      if (claim.kind === "conflict") {
        return {
          success: false as const,
          message:
            "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
        };
      }
      if (claim.kind === "replayed") {
        const reservationId = claim.resultIds.reservationId;
        if (typeof reservationId !== "number") {
          return {
            success: false as const,
            message:
              "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
          };
        }
        return { reservationId };
      }

      const finish = async (
        outcome:
          | { success: false; message: string }
          | { reservationId: number },
      ) => {
        if ("success" in outcome && outcome.success === false) {
          await abandonRequest(tx, idempotencyKey);
          return outcome;
        }
        if ("reservationId" in outcome) {
          await completeRequest(tx, idempotencyKey, {
            reservationId: outcome.reservationId,
          });
        }
        return outcome;
      };

      const locked = await lockReservationAggregate(tx, {
        festivalId,
        userIds: [],
        standIds: [standId],
      });
      if (!locked.ok) {
        return finish({
          success: false,
          message:
            "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
        });
      }

      const [lockedStand] = await tx
        .select()
        .from(stands)
        .where(eq(stands.id, standId))
        .limit(1)
        .for("update");
      if (!lockedStand || lockedStand.festivalId !== festivalId) {
        return finish({ success: false, message: "El espacio no existe" });
      }
      if (
        lockedStand.status === "disabled" ||
        (await standHasLiveOccupancy(tx, standId))
      ) {
        return finish({
          success: false,
          message: "El espacio no está disponible",
        });
      }

      let participantId = externalParticipantId ?? null;
      if (participantId != null) {
        const [existing] = await tx
          .select({ id: externalParticipants.id })
          .from(externalParticipants)
          .where(eq(externalParticipants.id, participantId))
          .limit(1);
        if (!existing) {
          return finish({
            success: false,
            message: "El participante externo no existe",
          });
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

      if (participantId == null) {
        return finish({
          success: false,
          message: "El participante externo no existe",
        });
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

      await insertStandReservationEvent(tx, {
        reservationId: reservation.id,
        actorUserId: currentProfile.id,
        eventType: "created",
        toStatus: "accepted",
        payload: {
          source: "admin_assignment",
          standId,
          externalParticipantId: participantId,
          phase0MemberStandId: standId,
        },
      });

      return finish({ reservationId: reservation.id });
    });

    if ("success" in result && result.success === false) {
      return result;
    }

    const reservationId = (result as { reservationId: number }).reservationId;
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
  } catch (error: unknown) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code: string }).code === "string"
        ? (error as { code: string }).code
        : "";
    if (code === "23505" || code === "40001") {
      return {
        success: false,
        message: "El espacio no está disponible",
      };
    }
    console.error("[capacity] createExternalParticipantReservation failed", {
      festivalId,
      standId,
      ...(error instanceof Error
        ? { name: error.name, message: error.message }
        : { message: "Unknown error" }),
    });
    return {
      success: false,
      message: "Ups! No pudimos crear la reserva externa",
    };
  }
}
