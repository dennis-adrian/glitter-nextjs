"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  buildInfractionTypeCode,
  changeInfractionTypeActivitySchema,
  createInfractionTypeSchema,
  type ChangeInfractionTypeActivityInput,
  type CreateInfractionTypeInput,
  type UpdateInfractionTypeInput,
  updateInfractionTypeSchema,
} from "@/app/lib/infraction-types/schema";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { infractionTypes } from "@/db/schema";

function revalidateInfractionTypePaths() {
  revalidatePath("/dashboard/infractions");
  revalidatePath("/dashboard/infractions/types");
  revalidatePath("/dashboard/festivals", "layout");
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = Reflect.get(error, "code");
  if (typeof direct === "string") return direct;
  const cause = Reflect.get(error, "cause");
  if (!cause || typeof cause !== "object") return undefined;
  const nested = Reflect.get(cause, "code");
  return typeof nested === "string" ? nested : undefined;
}

export async function fetchAllInfractionTypes() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    throw new Error("No autorizado para consultar tipos de infracción");
  }

  return db.query.infractionTypes.findMany({
    orderBy: (type, { asc }) => [asc(type.label)],
  });
}

export async function fetchActiveInfractionTypes() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    throw new Error("No autorizado para consultar tipos de infracción");
  }

  return db.query.infractionTypes.findMany({
    where: eq(infractionTypes.active, true),
    orderBy: (type, { asc }) => [asc(type.label)],
  });
}

export async function createInfractionType(
  rawInput: CreateInfractionTypeInput,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = createInfractionTypeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const code = buildInfractionTypeCode(parsed.data.label);
  if (!code) {
    return {
      success: false as const,
      message: "El nombre debe contener letras o números",
    };
  }

  try {
    const [created] = await db
      .insert(infractionTypes)
      .values({
        code,
        label: parsed.data.label,
        description: parsed.data.description,
        severity: parsed.data.severity,
      })
      .onConflictDoNothing()
      .returning({ id: infractionTypes.id });

    if (!created) {
      return {
        success: false as const,
        message: "Ya existe un tipo de infracción con ese nombre",
      };
    }

    revalidateInfractionTypePaths();
    return {
      success: true as const,
      message: "Tipo de infracción creado correctamente",
      id: created.id,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message:
        getDatabaseErrorCode(error) === "23505"
          ? "Ya existe un tipo de infracción con ese nombre"
          : "No se pudo crear el tipo de infracción",
    };
  }
}

export async function updateInfractionType(
  rawInput: UpdateInfractionTypeInput,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = updateInfractionTypeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  try {
    const duplicate = await db.query.infractionTypes.findFirst({
      where: and(
        ne(infractionTypes.id, parsed.data.id),
        sql`lower(${infractionTypes.label}) = lower(${parsed.data.label})`,
      ),
      columns: { id: true },
    });
    if (duplicate) {
      return {
        success: false as const,
        message: "Ya existe un tipo de infracción con ese nombre",
      };
    }

    const [updated] = await db
      .update(infractionTypes)
      .set({
        label: parsed.data.label,
        description: parsed.data.description,
        severity: parsed.data.severity,
        updatedAt: new Date(),
      })
      .where(eq(infractionTypes.id, parsed.data.id))
      .returning({ id: infractionTypes.id });

    if (!updated) {
      return {
        success: false as const,
        message: "Tipo de infracción no encontrado",
      };
    }

    revalidateInfractionTypePaths();
    return {
      success: true as const,
      message: "Tipo de infracción actualizado correctamente",
    };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message:
        getDatabaseErrorCode(error) === "23505"
          ? "Ya existe un tipo de infracción con ese nombre"
          : "No se pudo actualizar el tipo de infracción",
    };
  }
}

export async function changeInfractionTypeActivity(
  rawInput: ChangeInfractionTypeActivityInput,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = changeInfractionTypeActivitySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const now = new Date();
  try {
    const [updated] = await db
      .update(infractionTypes)
      .set({
        active: parsed.data.active,
        archivedAt: parsed.data.active ? null : now,
        updatedAt: now,
      })
      .where(eq(infractionTypes.id, parsed.data.id))
      .returning({ id: infractionTypes.id });

    if (!updated) {
      return {
        success: false as const,
        message: "Tipo de infracción no encontrado",
      };
    }

    revalidateInfractionTypePaths();
    return {
      success: true as const,
      message: parsed.data.active
        ? "Tipo de infracción reactivado"
        : "Tipo de infracción archivado",
    };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message: "No se pudo actualizar el estado del tipo de infracción",
    };
  }
}
