import "server-only";

import { eq } from "drizzle-orm";

import {
  lockFestivalRow,
  lockFestivalTermsDocument,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockUserRequestRows,
} from "@/app/lib/reservations/locks";
import {
  enqueueReservationNotification,
  scheduleReservationNotificationJobs,
} from "@/app/lib/reservations/notification-outbox";
import {
  parseUnknown,
  reviewBecomeArtistRequestSchema,
  reviewFestivalParticipationRequestSchema,
} from "@/app/lib/reservations/schemas";
import {
  requireAdmin,
  requireAdminOrFestivalAdmin,
} from "@/app/lib/users/helpers";
import { db } from "@/db";
import { userRequests, users } from "@/db/schema";
import { revalidatePath } from "next/cache";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadRequestPreview(requestId: number) {
  const [row] = await db
    .select({
      id: userRequests.id,
      userId: userRequests.userId,
      festivalId: userRequests.festivalId,
      type: userRequests.type,
      status: userRequests.status,
    })
    .from(userRequests)
    .where(eq(userRequests.id, requestId))
    .limit(1);
  return row ?? null;
}

async function lockAndReadRequest(tx: DbTx, requestId: number) {
  await lockUserRequestRows(tx, [requestId]);
  const [row] = await tx
    .select()
    .from(userRequests)
    .where(eq(userRequests.id, requestId))
    .limit(1)
    .for("update");
  return row ?? null;
}

export async function reviewFestivalParticipationRequest(
  input: unknown,
): Promise<{ success: boolean; message: string }> {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  const parsed = parseUnknown(reviewFestivalParticipationRequestSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }
  const { requestId, status, reason } = parsed.data;

  const preview = await loadRequestPreview(requestId);
  if (!preview) {
    return { success: false, message: "La solicitud no existe." };
  }
  if (preview.type !== "festival_participation" || preview.festivalId == null) {
    return { success: false, message: "La solicitud no existe." };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      await lockParticipants(tx, preview.festivalId!, [preview.userId]);
      const festival = await lockFestivalRow(tx, preview.festivalId!);
      if (!festival) {
        return { success: false as const, message: "El festival no existe." };
      }
      await lockFestivalTermsDocument(tx);
      await lockParticipantEligibilityRows(tx, preview.festivalId!, [
        preview.userId,
      ]);

      const request = await lockAndReadRequest(tx, requestId);
      if (!request) {
        return { success: false as const, message: "La solicitud no existe." };
      }
      if (
        request.type !== "festival_participation" ||
        request.festivalId !== preview.festivalId ||
        request.userId !== preview.userId
      ) {
        return {
          success: false as const,
          message:
            "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
        };
      }
      if (request.status === status) {
        return { success: true as const, jobIds: [] as number[] };
      }
      if (request.status !== "pending") {
        return {
          success: false as const,
          message: "La solicitud ya no admite este cambio.",
        };
      }

      await tx
        .update(userRequests)
        .set({ status, updatedAt: new Date() })
        .where(eq(userRequests.id, request.id));

      const [recipient] = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);
      const email = recipient?.email?.trim();
      const jobIds: number[] = [];
      if (email) {
        const kind =
          status === "accepted"
            ? ("festival_participation_approved" as const)
            : ("festival_participation_rejected" as const);
        const jobId = await enqueueReservationNotification(tx, {
          kind,
          reservationId: null,
          userId: request.userId,
          recipientEmail: email,
          payload: {
            requestId: request.id,
            userId: request.userId,
            festivalId: request.festivalId,
            ...(reason ? { reason } : {}),
          },
          deduplicationKey: `${kind}:${request.id}:${email.toLowerCase()}`,
        });
        if (jobId) jobIds.push(jobId);
      }

      return { success: true as const, jobIds };
    });

    if (!outcome.success) return outcome;
    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/dashboard", "layout");
    return {
      success: true,
      message:
        status === "accepted"
          ? "La solicitud ha sido aprobada."
          : "La solicitud ha sido rechazada.",
    };
  } catch (error) {
    console.error("Error reviewing festival participation request", error);
    return { success: false, message: "Error al actualizar la solicitud" };
  }
}

export async function reviewBecomeArtistRequest(
  input: unknown,
): Promise<{ success: boolean; message: string }> {
  const actor = await requireAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  const parsed = parseUnknown(reviewBecomeArtistRequestSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }
  const { requestId, status } = parsed.data;

  const preview = await loadRequestPreview(requestId);
  if (!preview) {
    return { success: false, message: "La solicitud no existe." };
  }
  if (preview.type !== "become_artist") {
    return { success: false, message: "La solicitud no existe." };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, preview.userId))
        .limit(1)
        .for("update");

      const request = await lockAndReadRequest(tx, requestId);
      if (!request) {
        return { success: false as const, message: "La solicitud no existe." };
      }
      if (request.type !== "become_artist" || request.userId !== preview.userId) {
        return {
          success: false as const,
          message:
            "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
        };
      }
      if (request.status === status) {
        return { success: true as const };
      }
      if (request.status !== "pending") {
        return {
          success: false as const,
          message: "La solicitud ya no admite este cambio.",
        };
      }

      await tx
        .update(userRequests)
        .set({ status, updatedAt: new Date() })
        .where(eq(userRequests.id, request.id));

      const [profile] = await tx
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);
      if (profile && profile.role !== "admin") {
        await tx
          .update(users)
          .set({
            role: status === "accepted" ? "artist" : "user",
            updatedAt: new Date(),
          })
          .where(eq(users.id, profile.id));
      }

      return { success: true as const };
    });

    if (!outcome.success) return outcome;
    revalidatePath("/dashboard", "layout");
    return {
      success: true,
      message:
        status === "accepted"
          ? "La solicitud ha sido aprobada."
          : "La solicitud ha sido rechazada.",
    };
  } catch (error) {
    console.error("Error reviewing become-artist request", error);
    return { success: false, message: "Error al actualizar la solicitud" };
  }
}
