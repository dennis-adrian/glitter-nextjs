"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logInfractionEvent } from "@/app/lib/infractions/events";
import { buildInfractionStatusUpdate } from "@/app/lib/infractions/lifecycle";
import type { SanctionMutationResult } from "@/app/lib/sanctions/definitions";
import {
  mapSanctionMutationError,
  sanctionDomainError,
} from "@/app/lib/sanctions/errors";
import { logSanctionEvent } from "@/app/lib/sanctions/events";
import {
  calculateSanctionEndsAt,
  canEditSanction,
  canRevokeSanction,
  isLegacyActiveEquivalent,
  isSanctionValidityExtension,
  resolveSanctionStatusOnApproval,
} from "@/app/lib/sanctions/lifecycle";
import {
  fetchExistingSanctionLinks,
  fetchSanctionInfractionIds,
  lockInfractionsForMutation,
  lockSanctionForMutation,
} from "@/app/lib/sanctions/locking";
import { fetchEligibleInfractionsForSanction } from "@/app/lib/sanctions/queries";
import {
  createSanctionSchema,
  editSanctionSchema,
  revokeSanctionSchema,
  searchEligibleInfractionsSchema,
  type CreateSanctionInput,
  type EditSanctionInput,
  type RevokeSanctionInput,
  type SearchEligibleInfractionsInput,
} from "@/app/lib/sanctions/schema";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { infractions, sanctionInfractions, sanctions } from "@/db/schema";

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function revalidateSanctionPaths(input: {
  sanctionId?: number;
  userId?: number;
  infractionIds?: readonly number[];
}) {
  revalidatePath("/dashboard/infractions");
  if (input.sanctionId) {
    revalidatePath(`/dashboard/sanctions/${input.sanctionId}`);
  }
  for (const infractionId of input.infractionIds ?? []) {
    revalidatePath(`/dashboard/infractions/${infractionId}`);
  }
  if (input.userId) {
    revalidatePath(`/profiles/${input.userId}/infractions`);
  }
}

export async function searchEligibleInfractionsForSanction(
  rawInput: SearchEligibleInfractionsInput,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return [];

  const parsed = searchEligibleInfractionsSchema.safeParse(rawInput);
  if (!parsed.success) return [];

  return fetchEligibleInfractionsForSanction(parsed.data);
}

export async function createAndApproveSanction(
  rawInput: CreateSanctionInput,
): Promise<SanctionMutationResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return {
      success: false,
      message: "No autorizado",
      code: "unauthorized",
    };
  }

  const parsed = createSanctionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
      code: "validation",
    };
  }

  const data = parsed.data;
  const now = new Date();

  try {
    const endsAt = calculateSanctionEndsAt(
      data.startsAt,
      data.validityDuration ?? null,
      data.validityUnit,
    );
    const status = resolveSanctionStatusOnApproval(data.startsAt, endsAt, now);
    if (status === "expired") {
      throw sanctionDomainError(
        "La validez de la sanción debe finalizar después del momento de aprobación",
        "validation",
      );
    }
    const description = emptyToNull(data.description);
    const reservationDelayMinutes =
      data.type === "reservation_delay" ? data.reservationDelayMinutes! : null;
    const validityDuration =
      data.validityUnit === "indefinitely"
        ? null
        : (data.validityDuration ?? null);

    const sanctionId = await db.transaction(async (tx) => {
      const selected = await lockInfractionsForMutation(tx, data.infractionIds);

      if (selected.length !== data.infractionIds.length) {
        throw sanctionDomainError(
          "Una o más infracciones no existen",
          "not_found",
        );
      }

      const existingLinks = await fetchExistingSanctionLinks(
        tx,
        data.infractionIds,
      );
      const linkedInfractionIds = new Set(
        existingLinks.map((link) => link.infractionId),
      );

      for (const infraction of selected) {
        if (infraction.userId !== data.userId) {
          throw sanctionDomainError(
            "Todas las infracciones deben pertenecer al mismo participante",
            "validation",
          );
        }
        if (infraction.status === "voided") {
          throw sanctionDomainError(
            "No se pueden vincular infracciones anuladas",
            "validation",
          );
        }
        if (linkedInfractionIds.has(infraction.id)) {
          throw sanctionDomainError(
            `La infracción #${infraction.id} ya está vinculada a otra sanción`,
            "conflict",
          );
        }
      }

      const [created] = await tx
        .insert(sanctions)
        .values({
          userId: data.userId,
          infractionId: data.infractionIds[0],
          type: data.type,
          status,
          description,
          festivalScope: data.festivalScope,
          validityDuration,
          validityUnit: data.validityUnit,
          startsAt: data.startsAt,
          endsAt,
          reservationDelayMinutes,
          createdByUserId: profile.id,
          approvedByUserId: profile.id,
          approvedAt: now,
          duration: validityDuration,
          durationUnit: data.validityUnit,
          active: isLegacyActiveEquivalent(status),
          updatedAt: now,
          createdAt: now,
        })
        .returning({ id: sanctions.id });

      if (!created) {
        throw new Error("No se pudo crear la sanción");
      }

      await tx.insert(sanctionInfractions).values(
        data.infractionIds.map((infractionId) => ({
          sanctionId: created.id,
          infractionId,
          linkedByUserId: profile.id,
          linkedAt: now,
        })),
      );

      await logSanctionEvent(tx, {
        sanctionId: created.id,
        actorUserId: profile.id,
        eventType: "created",
        toStatus: status,
        changes: {
          type: data.type,
          festivalScope: data.festivalScope,
          validityUnit: data.validityUnit,
          validityDuration,
          startsAt: data.startsAt.toISOString(),
          endsAt: endsAt?.toISOString() ?? null,
          reservationDelayMinutes,
          infractionIds: data.infractionIds,
        },
      });

      await logSanctionEvent(tx, {
        sanctionId: created.id,
        actorUserId: profile.id,
        eventType: "approved",
        toStatus: status,
        note: "Aprobada en el mismo flujo de creación",
      });

      for (const infraction of selected) {
        const willResolve =
          infraction.status === "pending" ||
          infraction.status === "under_review";

        await logInfractionEvent(tx, {
          infractionId: infraction.id,
          actorUserId: profile.id,
          eventType: "sanction_linked",
          fromStatus: infraction.status,
          toStatus: willResolve ? "resolved" : infraction.status,
          changes: { sanctionId: created.id },
          note: `Vinculada a la sanción #${created.id}`,
        });

        if (willResolve) {
          await tx
            .update(infractions)
            .set(
              buildInfractionStatusUpdate({
                status: "resolved",
                actorUserId: profile.id,
                now,
                resolutionNotes: `Resuelta automáticamente al aprobar la sanción #${created.id}`,
              }),
            )
            .where(eq(infractions.id, infraction.id));

          await logInfractionEvent(tx, {
            infractionId: infraction.id,
            actorUserId: profile.id,
            eventType: "resolved",
            fromStatus: infraction.status,
            toStatus: "resolved",
            note: `Resuelta automáticamente al aprobar la sanción #${created.id}`,
          });
        }
      }

      return created.id;
    });

    revalidateSanctionPaths({
      sanctionId,
      userId: data.userId,
      infractionIds: data.infractionIds,
    });

    return {
      success: true,
      message: "Sanción creada y aprobada",
      sanctionId,
    };
  } catch (error) {
    console.error(error);
    return mapSanctionMutationError(error, "No se pudo crear la sanción");
  }
}

export async function editSanction(
  rawInput: EditSanctionInput,
): Promise<SanctionMutationResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return {
      success: false,
      message: "No autorizado",
      code: "unauthorized",
    };
  }

  const parsed = editSanctionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
      code: "validation",
    };
  }

  const data = parsed.data;
  const now = new Date();

  try {
    const result = await db.transaction(async (tx) => {
      const existing = await lockSanctionForMutation(tx, data.sanctionId);

      if (!existing) {
        throw sanctionDomainError("Sanción no encontrada", "not_found");
      }

      if (!canEditSanction(existing.status)) {
        throw sanctionDomainError(
          "Solo se pueden editar sanciones programadas o activas",
          "validation",
        );
      }

      if (existing.type === "reservation_delay") {
        if (
          data.reservationDelayMinutes == null ||
          data.reservationDelayMinutes <= 0
        ) {
          throw sanctionDomainError(
            "El retraso de reserva debe ser un número positivo de minutos",
            "validation",
          );
        }
      } else if (data.reservationDelayMinutes != null) {
        throw sanctionDomainError(
          "El retraso solo aplica al tipo retraso de reserva",
          "validation",
        );
      }

      const currentLinks = await fetchSanctionInfractionIds(tx, existing.id);
      const currentIds = new Set(currentLinks.map((link) => link.infractionId));
      const addIds = data.addInfractionIds.filter((id) => !currentIds.has(id));
      const removeIds = data.removeInfractionIds.filter((id) =>
        currentIds.has(id),
      );

      if (currentIds.size - removeIds.length + addIds.length < 1) {
        throw sanctionDomainError(
          "La sanción debe conservar al menos una infracción",
          "validation",
        );
      }

      if (addIds.length > 0) {
        const toAdd = await lockInfractionsForMutation(tx, addIds);

        if (toAdd.length !== addIds.length) {
          throw sanctionDomainError(
            "Infracción a vincular no encontrada",
            "not_found",
          );
        }

        const existingLinks = await fetchExistingSanctionLinks(tx, addIds);
        const linkedInfractionIds = new Set(
          existingLinks.map((link) => link.infractionId),
        );

        for (const infraction of toAdd) {
          if (infraction.userId !== existing.userId) {
            throw sanctionDomainError(
              "Todas las infracciones deben pertenecer al mismo participante",
              "validation",
            );
          }
          if (infraction.status === "voided") {
            throw sanctionDomainError(
              "No se pueden vincular infracciones anuladas",
              "validation",
            );
          }
          if (linkedInfractionIds.has(infraction.id)) {
            throw sanctionDomainError(
              `La infracción #${infraction.id} ya está vinculada a otra sanción`,
              "conflict",
            );
          }
        }

        await tx.insert(sanctionInfractions).values(
          addIds.map((infractionId) => ({
            sanctionId: existing.id,
            infractionId,
            linkedByUserId: profile.id,
            linkedAt: now,
          })),
        );

        for (const infraction of toAdd) {
          const willResolve =
            infraction.status === "pending" ||
            infraction.status === "under_review";

          await logInfractionEvent(tx, {
            infractionId: infraction.id,
            actorUserId: profile.id,
            eventType: "sanction_linked",
            fromStatus: infraction.status,
            toStatus: willResolve ? "resolved" : infraction.status,
            changes: { sanctionId: existing.id },
            note: `Vinculada a la sanción #${existing.id}`,
          });

          if (willResolve) {
            await tx
              .update(infractions)
              .set(
                buildInfractionStatusUpdate({
                  status: "resolved",
                  actorUserId: profile.id,
                  now,
                  resolutionNotes: `Resuelta automáticamente al vincular la sanción #${existing.id}`,
                }),
              )
              .where(eq(infractions.id, infraction.id));

            await logInfractionEvent(tx, {
              infractionId: infraction.id,
              actorUserId: profile.id,
              eventType: "resolved",
              fromStatus: infraction.status,
              toStatus: "resolved",
              note: `Resuelta automáticamente al vincular la sanción #${existing.id}`,
            });
          }
        }
      }

      if (removeIds.length > 0) {
        await tx
          .delete(sanctionInfractions)
          .where(
            and(
              eq(sanctionInfractions.sanctionId, existing.id),
              inArray(sanctionInfractions.infractionId, removeIds),
            ),
          );
      }

      const remainingLinks = await fetchSanctionInfractionIds(tx, existing.id);

      const endsAt = calculateSanctionEndsAt(
        data.startsAt,
        data.validityDuration,
        data.validityUnit,
      );
      const status = resolveSanctionStatusOnApproval(
        data.startsAt,
        endsAt,
        now,
      );
      if (status === "expired") {
        throw sanctionDomainError(
          "La validez de la sanción debe finalizar después del momento de edición",
          "validation",
        );
      }
      const validityDuration =
        data.validityUnit === "indefinitely" ? null : data.validityDuration;
      const description = emptyToNull(data.description);
      const reservationDelayMinutes =
        existing.type === "reservation_delay"
          ? data.reservationDelayMinutes
          : null;

      const changes: Record<string, unknown> = {};
      if (existing.description !== description) {
        changes.description = {
          from: existing.description,
          to: description,
        };
      }
      if (existing.festivalScope !== data.festivalScope) {
        changes.festivalScope = {
          from: existing.festivalScope,
          to: data.festivalScope,
        };
      }
      if (
        existing.validityUnit !== data.validityUnit ||
        existing.validityDuration !== validityDuration
      ) {
        changes.validity = {
          from: {
            unit: existing.validityUnit,
            duration: existing.validityDuration,
          },
          to: { unit: data.validityUnit, duration: validityDuration },
        };
      }
      if (existing.startsAt.getTime() !== data.startsAt.getTime()) {
        changes.startsAt = {
          from: existing.startsAt.toISOString(),
          to: data.startsAt.toISOString(),
        };
      }
      if (existing.reservationDelayMinutes !== reservationDelayMinutes) {
        changes.reservationDelayMinutes = {
          from: existing.reservationDelayMinutes,
          to: reservationDelayMinutes,
        };
      }
      if (addIds.length || removeIds.length) {
        changes.infractions = { added: addIds, removed: removeIds };
      }

      await tx
        .update(sanctions)
        .set({
          description,
          festivalScope: data.festivalScope,
          validityUnit: data.validityUnit,
          validityDuration,
          startsAt: data.startsAt,
          endsAt,
          status,
          reservationDelayMinutes,
          infractionId: remainingLinks[0]?.infractionId ?? null,
          duration: validityDuration,
          durationUnit: data.validityUnit,
          active: isLegacyActiveEquivalent(status),
          updatedAt: now,
        })
        .where(eq(sanctions.id, existing.id));

      const validityChanged =
        existing.validityUnit !== data.validityUnit ||
        existing.validityDuration !== validityDuration ||
        (existing.endsAt?.getTime() ?? null) !== (endsAt?.getTime() ?? null);
      const eventType =
        existing.festivalScope !== data.festivalScope
          ? ("scope_changed" as const)
          : addIds.length || removeIds.length
            ? ("infractions_changed" as const)
            : validityChanged &&
                isSanctionValidityExtension(
                  {
                    validityUnit: existing.validityUnit,
                    validityDuration: existing.validityDuration,
                    endsAt: existing.endsAt,
                  },
                  {
                    validityUnit: data.validityUnit,
                    validityDuration,
                    endsAt,
                  },
                )
              ? ("extended" as const)
              : ("edited" as const);

      await logSanctionEvent(tx, {
        sanctionId: existing.id,
        actorUserId: profile.id,
        eventType,
        fromStatus: existing.status,
        toStatus: status,
        changes,
        note: data.reason,
      });

      return {
        sanctionId: existing.id,
        userId: existing.userId,
        infractionIds: [
          ...remainingLinks.map((link) => link.infractionId),
          ...removeIds,
        ],
      };
    });

    revalidateSanctionPaths(result);

    return {
      success: true,
      message: "Sanción actualizada",
      sanctionId: result.sanctionId,
    };
  } catch (error) {
    console.error(error);
    return mapSanctionMutationError(error, "No se pudo actualizar la sanción");
  }
}

export async function revokeSanction(
  rawInput: RevokeSanctionInput,
): Promise<SanctionMutationResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return {
      success: false,
      message: "No autorizado",
      code: "unauthorized",
    };
  }

  const parsed = revokeSanctionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
      code: "validation",
    };
  }

  const data = parsed.data;
  const now = new Date();

  try {
    const result = await db.transaction(async (tx) => {
      const existing = await lockSanctionForMutation(tx, data.sanctionId);

      if (!existing) {
        throw sanctionDomainError("Sanción no encontrada", "not_found");
      }

      if (!canRevokeSanction(existing.status)) {
        throw sanctionDomainError(
          "Solo se pueden revocar sanciones programadas o activas",
          "validation",
        );
      }

      const currentLinks = await fetchSanctionInfractionIds(tx, existing.id);

      await tx
        .update(sanctions)
        .set({
          status: "revoked",
          active: false,
          revokedAt: now,
          revokedByUserId: profile.id,
          revocationReason: data.revocationReason,
          updatedAt: now,
        })
        .where(eq(sanctions.id, existing.id));

      await logSanctionEvent(tx, {
        sanctionId: existing.id,
        actorUserId: profile.id,
        eventType: "revoked",
        fromStatus: existing.status,
        toStatus: "revoked",
        note: data.revocationReason,
      });

      return {
        sanctionId: existing.id,
        userId: existing.userId,
        infractionIds: currentLinks.map((link) => link.infractionId),
      };
    });

    revalidateSanctionPaths(result);

    return {
      success: true,
      message: "Sanción revocada",
      sanctionId: result.sanctionId,
    };
  } catch (error) {
    console.error(error);
    return mapSanctionMutationError(error, "No se pudo revocar la sanción");
  }
}
