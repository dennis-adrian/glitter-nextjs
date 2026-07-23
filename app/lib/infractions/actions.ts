"use server";

import { and, desc, eq, gte, isNull, sql, asc, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { INFRACTION_DUPLICATE_WINDOW_HOURS } from "@/app/lib/infractions/constants";
import type {
  DuplicateInfractionCandidate,
  RegisterInfractionResult,
} from "@/app/lib/infractions/definitions";
import { logInfractionEvent } from "@/app/lib/infractions/events";
import {
  assertInfractionStatusTransition,
  buildInfractionStatusUpdate,
} from "@/app/lib/infractions/lifecycle";
import {
  attemptDisciplinaryNotificationJob,
  enqueueInfractionLifecycleNotification,
} from "@/app/lib/infractions/notifications";
import {
  changeInfractionStatusSchema,
  editInfractionSchema,
  registerInfractionSchema,
  addInfractionNoteSchema,
  addInfractionEvidenceSchema,
  searchInfractionUsersSchema,
  type ChangeInfractionStatusInput,
  type EditInfractionInput,
  type RegisterInfractionInput,
  type AddInfractionNoteInput,
  type AddInfractionEvidenceInput,
} from "@/app/lib/infractions/schema";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivals,
  infractionEvidence,
  infractionNotes,
  infractions,
  infractionTypes,
  reservationParticipants,
  standReservations,
  users,
} from "@/db/schema";

type InfractionDatabase = Pick<typeof db, "query" | "select">;

type ReferenceValidationResult =
  | { success: true }
  | {
      success: false;
      message: string;
      code: "not_found" | "validation";
    };

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function userParticipatedInFestival(
  database: InfractionDatabase,
  userId: number,
  festivalId: number,
): Promise<boolean> {
  const [row] = await database
    .select({ id: reservationParticipants.id })
    .from(reservationParticipants)
    .innerJoin(
      standReservations,
      eq(standReservations.id, reservationParticipants.reservationId),
    )
    .where(
      and(
        eq(reservationParticipants.userId, userId),
        eq(standReservations.festivalId, festivalId),
      ),
    )
    .limit(1);

  return Boolean(row);
}

async function validateInfractionReferences(
  database: InfractionDatabase,
  input: {
    userId: number;
    typeId: number;
    festivalId: number | null;
  },
): Promise<ReferenceValidationResult> {
  const [user, type, festival] = await Promise.all([
    database.query.users.findFirst({
      where: and(eq(users.id, input.userId), eq(users.role, "user")),
      columns: { id: true },
    }),
    database.query.infractionTypes.findFirst({
      where: eq(infractionTypes.id, input.typeId),
      columns: { id: true },
    }),
    input.festivalId == null
      ? Promise.resolve(null)
      : database.query.festivals.findFirst({
          where: eq(festivals.id, input.festivalId),
          columns: { id: true },
        }),
  ]);

  if (!user) {
    return {
      success: false,
      message: "Participante no encontrado",
      code: "not_found",
    };
  }
  if (!type) {
    return {
      success: false,
      message: "Tipo de infracción no encontrado",
      code: "not_found",
    };
  }
  if (input.festivalId != null && !festival) {
    return {
      success: false,
      message: "Festival no encontrado",
      code: "not_found",
    };
  }
  if (
    input.festivalId != null &&
    !(await userParticipatedInFestival(
      database,
      input.userId,
      input.festivalId,
    ))
  ) {
    return {
      success: false,
      message:
        "El participante no tiene participación registrada en el festival seleccionado",
      code: "validation",
    };
  }

  return { success: true };
}

async function findDuplicateCandidates(input: {
  userId: number;
  typeId: number;
  festivalId: number | null;
}): Promise<DuplicateInfractionCandidate[]> {
  const windowStart = new Date(
    Date.now() - INFRACTION_DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000,
  );

  const festivalCondition =
    input.festivalId == null
      ? isNull(infractions.festivalId)
      : eq(infractions.festivalId, input.festivalId);

  return db.query.infractions.findMany({
    where: and(
      eq(infractions.userId, input.userId),
      eq(infractions.typeId, input.typeId),
      festivalCondition,
      gte(infractions.createdAt, windowStart),
      sql`${infractions.status} <> 'voided'`,
    ),
    columns: {
      id: true,
      userId: true,
      typeId: true,
      festivalId: true,
      status: true,
      createdAt: true,
      description: true,
    },
    with: {
      type: {
        columns: {
          id: true,
          label: true,
          severity: true,
        },
      },
    },
    orderBy: [desc(infractions.createdAt)],
    limit: 10,
  });
}

function revalidateInfractionPaths(input: {
  festivalIds?: readonly (number | null | undefined)[];
  userId?: number;
  infractionId?: number;
}) {
  revalidatePath("/dashboard/infractions");
  if (input.infractionId) {
    revalidatePath(`/dashboard/infractions/${input.infractionId}`);
  }
  const festivalIds = new Set(
    (input.festivalIds ?? []).filter(
      (festivalId): festivalId is number => festivalId != null,
    ),
  );
  for (const festivalId of festivalIds) {
    revalidatePath(`/dashboard/festivals/${festivalId}/participants`);
  }
  if (input.userId) {
    revalidatePath(`/profiles/${input.userId}/infractions`);
  }
}

export async function fetchInfractionTypes() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return [];

  try {
    return db.query.infractionTypes.findMany({
      orderBy: (infractionTypes, { asc }) => [asc(infractionTypes.label)],
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function registerInfraction(
  rawInput: RegisterInfractionInput,
): Promise<RegisterInfractionResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return {
      success: false,
      message: "No autorizado",
      code: "unauthorized",
    };
  }

  const parsed = registerInfractionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
      code: "validation",
    };
  }

  const data = parsed.data;
  const festivalId = data.festivalId ?? null;

  try {
    const existingByKey = await db.query.infractions.findFirst({
      where: eq(infractions.idempotencyKey, data.idempotencyKey),
      columns: { id: true },
    });
    if (existingByKey) {
      return {
        success: true,
        message: "Infracción ya registrada",
        infractionId: existingByKey.id,
        reused: true,
      };
    }

    const references = await validateInfractionReferences(db, {
      userId: data.userId,
      typeId: data.typeId,
      festivalId,
    });
    if (!references.success) {
      return references;
    }

    const duplicates = await findDuplicateCandidates({
      userId: data.userId,
      typeId: data.typeId,
      festivalId,
    });

    if (duplicates.length > 0 && !data.confirmDuplicate) {
      return {
        success: false,
        message:
          "Se encontraron infracciones similares recientes. Confirmá si es un incidente distinto.",
        code: "duplicate_warning",
        duplicates,
      };
    }

    const created = await db.transaction(async (tx) => {
      const [infraction] = await tx
        .insert(infractions)
        .values({
          userId: data.userId,
          typeId: data.typeId,
          festivalId,
          description: emptyToNull(data.description),
          status: "pending",
          handled: false,
          userGaveNotice: data.userGaveNotice,
          gaveNoticeAt: data.userGaveNotice ? data.gaveNoticeAt! : null,
          createdByUserId: profile.id,
          idempotencyKey: data.idempotencyKey,
        })
        .onConflictDoNothing({ target: infractions.idempotencyKey })
        .returning({ id: infractions.id });

      if (!infraction) {
        const reused = await tx.query.infractions.findFirst({
          where: eq(infractions.idempotencyKey, data.idempotencyKey),
          columns: { id: true },
        });
        if (!reused) {
          throw new Error("No se pudo crear la infracción");
        }
        return {
          id: reused.id,
          reused: true as const,
          notificationJobId: null,
        };
      }

      await logInfractionEvent(tx, {
        infractionId: infraction.id,
        actorUserId: profile.id,
        eventType: "created",
        toStatus: "pending",
        changes: {
          userId: data.userId,
          typeId: data.typeId,
          festivalId,
          userGaveNotice: data.userGaveNotice,
          gaveNoticeAt: data.userGaveNotice
            ? data.gaveNoticeAt?.toISOString()
            : null,
        },
      });

      if (data.confirmDuplicate && duplicates.length > 0) {
        await logInfractionEvent(tx, {
          infractionId: infraction.id,
          actorUserId: profile.id,
          eventType: "duplicate_confirmed",
          note: `Confirmado como incidente distinto pese a infracciones similares: ${duplicates
            .map((d) => d.id)
            .join(", ")}`,
          changes: {
            duplicateIds: duplicates.map((d) => d.id),
          },
        });
      }

      const notificationJobId = await enqueueInfractionLifecycleNotification(
        tx,
        {
          userId: data.userId,
          infractionId: infraction.id,
          kind: "registered",
          deduplicationKey: `infraction:${infraction.id}:registered`,
        },
      );

      return {
        id: infraction.id,
        reused: false as const,
        notificationJobId,
      };
    });

    revalidateInfractionPaths({
      festivalIds: [festivalId],
      userId: data.userId,
    });

    if (created.notificationJobId != null) {
      await attemptDisciplinaryNotificationJob(created.notificationJobId);
    }

    return {
      success: true,
      message: created.reused
        ? "Infracción ya registrada"
        : "Infracción registrada correctamente",
      infractionId: created.id,
      reused: created.reused,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Error al registrar la infracción",
    };
  }
}

export async function editInfraction(rawInput: EditInfractionInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = editInfractionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const data = parsed.data;
  const now = new Date();

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(infractions)
        .where(eq(infractions.id, data.infractionId))
        .for("update");
      if (!existing) {
        return {
          success: false as const,
          message: "Infracción no encontrada",
        };
      }
      if (existing.status === "voided") {
        return {
          success: false as const,
          message: "No se puede editar una infracción anulada",
        };
      }

      const references = await validateInfractionReferences(tx, {
        userId: existing.userId,
        typeId: data.typeId,
        festivalId: data.festivalId,
      });
      if (!references.success) {
        return references;
      }

      const nextDescription = emptyToNull(data.description);
      const nextGaveNoticeAt = data.userGaveNotice ? data.gaveNoticeAt : null;

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (existing.typeId !== data.typeId) {
        changes.typeId = { from: existing.typeId, to: data.typeId };
      }
      if (existing.festivalId !== data.festivalId) {
        changes.festivalId = {
          from: existing.festivalId,
          to: data.festivalId,
        };
      }
      if ((existing.description ?? null) !== nextDescription) {
        changes.description = {
          from: existing.description,
          to: nextDescription,
        };
      }
      if (existing.userGaveNotice !== data.userGaveNotice) {
        changes.userGaveNotice = {
          from: existing.userGaveNotice,
          to: data.userGaveNotice,
        };
      }
      const existingNoticeAt = existing.gaveNoticeAt?.toISOString() ?? null;
      const nextNoticeAt = nextGaveNoticeAt?.toISOString() ?? null;
      if (existingNoticeAt !== nextNoticeAt) {
        changes.gaveNoticeAt = { from: existingNoticeAt, to: nextNoticeAt };
      }

      if (Object.keys(changes).length === 0) {
        return {
          success: false as const,
          message: "No hay cambios para guardar",
        };
      }

      await tx
        .update(infractions)
        .set({
          typeId: data.typeId,
          festivalId: data.festivalId,
          description: nextDescription,
          userGaveNotice: data.userGaveNotice,
          gaveNoticeAt: nextGaveNoticeAt,
          updatedAt: now,
        })
        .where(eq(infractions.id, data.infractionId));

      await logInfractionEvent(tx, {
        infractionId: data.infractionId,
        actorUserId: profile.id,
        eventType: "edited",
        fromStatus: existing.status,
        toStatus: existing.status,
        changes,
        note: data.reason,
      });

      const notificationJobId = await enqueueInfractionLifecycleNotification(
        tx,
        {
          userId: existing.userId,
          infractionId: data.infractionId,
          kind: "edited",
          deduplicationKey: `infraction:${data.infractionId}:edited:${now.toISOString()}`,
          now,
        },
      );

      return {
        success: true as const,
        existingFestivalId: existing.festivalId,
        userId: existing.userId,
        notificationJobId,
      };
    });

    if (!result.success) return result;

    revalidateInfractionPaths({
      festivalIds: [result.existingFestivalId, data.festivalId],
      userId: result.userId,
    });

    await attemptDisciplinaryNotificationJob(result.notificationJobId);

    return {
      success: true as const,
      message: "Infracción actualizada correctamente",
    };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message: "Error al actualizar la infracción",
    };
  }
}

export async function changeInfractionStatus(
  rawInput: ChangeInfractionStatusInput,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = changeInfractionStatusSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const data = parsed.data;

  try {
    const now = new Date();
    const eventType =
      data.toStatus === "under_review"
        ? ("review_started" as const)
        : data.toStatus === "resolved"
          ? ("resolved" as const)
          : data.toStatus === "voided"
            ? ("voided" as const)
            : ("reopened" as const);

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(infractions)
        .where(eq(infractions.id, data.infractionId))
        .for("update");
      if (!existing) {
        return {
          success: false as const,
          message: "Infracción no encontrada",
        };
      }

      assertInfractionStatusTransition(existing.status, data.toStatus);

      await tx
        .update(infractions)
        .set({
          ...buildInfractionStatusUpdate({
            status: data.toStatus,
            actorUserId: profile.id,
            now,
            resolutionNotes: emptyToNull(data.resolutionNotes),
            voidReason: emptyToNull(data.voidReason),
          }),
        })
        .where(eq(infractions.id, data.infractionId));

      await logInfractionEvent(tx, {
        infractionId: data.infractionId,
        actorUserId: profile.id,
        eventType,
        fromStatus: existing.status,
        toStatus: data.toStatus,
        note:
          data.toStatus === "voided"
            ? emptyToNull(data.voidReason)
            : (emptyToNull(data.note) ?? emptyToNull(data.resolutionNotes)),
      });

      const notificationJobId =
        data.toStatus === "resolved" || data.toStatus === "voided"
          ? await enqueueInfractionLifecycleNotification(tx, {
              userId: existing.userId,
              infractionId: data.infractionId,
              kind: data.toStatus,
              deduplicationKey: `infraction:${data.infractionId}:${data.toStatus}:${now.toISOString()}`,
              participantNote:
                data.toStatus === "voided"
                  ? emptyToNull(data.voidReason)
                  : emptyToNull(data.resolutionNotes),
              now,
            })
          : null;

      return {
        success: true as const,
        festivalId: existing.festivalId,
        userId: existing.userId,
        notificationJobId,
      };
    });

    if (!result.success) return result;

    revalidateInfractionPaths({
      festivalIds: [result.festivalId],
      userId: result.userId,
    });

    if (result.notificationJobId != null) {
      await attemptDisciplinaryNotificationJob(result.notificationJobId);
    }

    return {
      success: true as const,
      message: "Estado de la infracción actualizado",
    };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message:
        error instanceof Error
          ? error.message
          : "Error al cambiar el estado de la infracción",
    };
  }
}

export async function addInfractionNote(rawInput: AddInfractionNoteInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = addInfractionNoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  try {
    const existing = await db.query.infractions.findFirst({
      where: eq(infractions.id, parsed.data.infractionId),
      columns: { id: true, userId: true, festivalId: true },
    });
    if (!existing) {
      return { success: false as const, message: "Infracción no encontrada" };
    }

    await db.insert(infractionNotes).values({
      infractionId: parsed.data.infractionId,
      authorUserId: profile.id,
      content: parsed.data.content.trim(),
    });

    revalidateInfractionPaths({
      festivalIds: [existing.festivalId],
      userId: existing.userId,
      infractionId: existing.id,
    });

    return { success: true as const, message: "Nota agregada" };
  } catch (error) {
    console.error(error);
    return { success: false as const, message: "Error al agregar la nota" };
  }
}

export async function addInfractionEvidence(
  rawInput: AddInfractionEvidenceInput,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = addInfractionEvidenceSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  try {
    const existing = await db.query.infractions.findFirst({
      where: eq(infractions.id, parsed.data.infractionId),
      columns: { id: true, userId: true, festivalId: true },
    });
    if (!existing) {
      return { success: false as const, message: "Infracción no encontrada" };
    }

    await db.insert(infractionEvidence).values({
      infractionId: parsed.data.infractionId,
      addedByUserId: profile.id,
      url: parsed.data.url,
      label: emptyToNull(parsed.data.label),
      mimeType: emptyToNull(parsed.data.mimeType),
    });

    revalidateInfractionPaths({
      festivalIds: [existing.festivalId],
      userId: existing.userId,
      infractionId: existing.id,
    });

    return {
      success: true as const,
      message: "Evidencia agregada",
    };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message: "Error al agregar la evidencia",
    };
  }
}

export async function searchUsersForInfraction(query: string, limit = 8) {
  const profile = await requireAdminOrFestivalAdmin();
  const parsed = searchInfractionUsersSchema.safeParse({ query, limit });
  if (!profile || !parsed.success) return [];

  const pattern = `%${parsed.data.query}%`;

  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(
      and(
        eq(users.role, "user"),
        or(
          ilike(users.displayName, pattern),
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern),
          ilike(users.email, pattern),
        ),
      ),
    )
    .orderBy(asc(users.displayName), asc(users.id))
    .limit(parsed.data.limit);
}
