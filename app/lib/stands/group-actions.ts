"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { resolveJointAxis } from "@/app/lib/stands/groups";
import { db } from "@/db";
import { standGroups, stands } from "@/db/schema";

type ActionResult = { success: boolean; message: string };
/** Carries the new group id so the editor can patch its local stands */
type GroupActionResult = ActionResult & { groupId?: number };

const standIdsSchema = z.array(z.number().int().positive()).min(1);

async function requireFestivalOrAdmin() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false as const, message: "Inicia sesión para continuar." };
  }
  if (profile.role !== "festival_admin" && profile.role !== "admin") {
    return {
      ok: false as const,
      message: "No tienes permisos para realizar esta acción.",
    };
  }
  return { ok: true as const };
}

/** Drops groups that no longer have at least two members */
async function pruneEmptyGroups(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  groupIds: number[],
) {
  if (groupIds.length === 0) return;
  const remaining = await tx
    .select({ id: stands.id, standGroupId: stands.standGroupId })
    .from(stands)
    .where(inArray(stands.standGroupId, groupIds));

  const counts = new Map<number, number>();
  for (const row of remaining) {
    if (row.standGroupId == null) continue;
    counts.set(row.standGroupId, (counts.get(row.standGroupId) ?? 0) + 1);
  }

  const stale = groupIds.filter((id) => (counts.get(id) ?? 0) < 2);
  if (stale.length === 0) return;

  // The stands FK is ON DELETE SET NULL, so the last member is released here
  await tx.delete(standGroups).where(inArray(standGroups.id, stale));
}

/**
 * Declares the given stands as one physical unit. Grouping is deliberately
 * manual: map coordinates are placed freehand, so adjacency cannot be inferred.
 */
export async function groupStands(
  standIds: number[],
): Promise<GroupActionResult> {
  const auth = await requireFestivalOrAdmin();
  if (!auth.ok) return { success: false, message: auth.message };

  try {
    const parsed = standIdsSchema.parse(standIds);
    if (parsed.length < 2) {
      return {
        success: false,
        message: "Selecciona al menos dos espacios para unirlos",
      };
    }

    const members = await db.query.stands.findMany({
      where: inArray(stands.id, parsed),
      columns: {
        id: true,
        festivalSectorId: true,
        positionLeft: true,
        positionTop: true,
        standGroupId: true,
      },
    });

    if (members.length !== parsed.length) {
      return {
        success: false,
        message: "No se encontraron todos los espacios",
      };
    }

    const sectorId = members[0].festivalSectorId;
    if (sectorId == null) {
      return {
        success: false,
        message: "Los espacios deben pertenecer a un sector",
      };
    }
    if (members.some((m) => m.festivalSectorId !== sectorId)) {
      return {
        success: false,
        message: "Solo se pueden unir espacios del mismo sector",
      };
    }
    if (members.some((m) => m.positionLeft == null || m.positionTop == null)) {
      return {
        success: false,
        message: "Los espacios deben estar ubicados en el plano",
      };
    }
    if (resolveJointAxis(members) === null) {
      return {
        success: false,
        message:
          "Los espacios deben estar alineados en una misma fila o columna",
      };
    }

    const previousGroupIds = Array.from(
      new Set(
        members
          .map((m) => m.standGroupId)
          .filter((id): id is number => id != null),
      ),
    );

    const groupId = await db.transaction(async (tx) => {
      const [group] = await tx
        .insert(standGroups)
        .values({ festivalSectorId: sectorId })
        .returning({ id: standGroups.id });

      await tx
        .update(stands)
        .set({ standGroupId: group.id, updatedAt: new Date() })
        .where(inArray(stands.id, parsed));

      await pruneEmptyGroups(tx, previousGroupIds);
      return group.id;
    });

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");

    return { success: true, message: "Espacios unidos con éxito", groupId };
  } catch (error) {
    console.error("Error grouping stands", error);
    return { success: false, message: "Error al unir los espacios" };
  }
}

/** Releases the given stands from whatever group they belong to */
export async function ungroupStands(standIds: number[]): Promise<ActionResult> {
  const auth = await requireFestivalOrAdmin();
  if (!auth.ok) return { success: false, message: auth.message };

  try {
    const parsed = standIdsSchema.parse(standIds);

    const members = await db.query.stands.findMany({
      where: inArray(stands.id, parsed),
      columns: { id: true, standGroupId: true },
    });

    const affectedGroupIds = Array.from(
      new Set(
        members
          .map((m) => m.standGroupId)
          .filter((id): id is number => id != null),
      ),
    );

    if (affectedGroupIds.length === 0) {
      return {
        success: false,
        message: "Los espacios seleccionados no están unidos",
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(stands)
        .set({ standGroupId: null, updatedAt: new Date() })
        .where(inArray(stands.id, parsed));

      await pruneEmptyGroups(tx, affectedGroupIds);
    });

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");

    return { success: true, message: "Espacios separados con éxito" };
  } catch (error) {
    console.error("Error ungrouping stands", error);
    return { success: false, message: "Error al separar los espacios" };
  }
}

/** Clears a group entirely, releasing every stand still attached to it */
export async function deleteStandGroup(groupId: number): Promise<ActionResult> {
  const auth = await requireFestivalOrAdmin();
  if (!auth.ok) return { success: false, message: auth.message };

  try {
    const parsed = z.number().int().positive().parse(groupId);
    await db.delete(standGroups).where(eq(standGroups.id, parsed));

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");

    return { success: true, message: "Grupo eliminado con éxito" };
  } catch (error) {
    console.error("Error deleting stand group", error);
    return { success: false, message: "Error al eliminar el grupo" };
  }
}
