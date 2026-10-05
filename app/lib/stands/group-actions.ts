"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import {
  createVisualGroup,
  ungroupVisualStands,
} from "@/app/lib/stands/group-service";

type ActionResult = { success: boolean; message: string };
/** Carries the new group id so the editor can patch its local stands */
type GroupActionResult = ActionResult & { groupId?: number };

const standIdsSchema = z.array(z.number().int().positive()).min(1);

const CHANGED_MESSAGE =
  "Los espacios cambiaron mientras tanto. Recargá la página y probá de nuevo.";

async function requireFestivalOrAdmin() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false as const, message: "Iniciá sesión para continuar." };
  }
  if (profile.role !== "festival_admin" && profile.role !== "admin") {
    return {
      ok: false as const,
      message: "No tenés permisos para realizar esta acción.",
    };
  }
  return { ok: true as const };
}

function fullTableHalvesPhrase(labels: string[]) {
  return `${labels.join(" y ")} ${
    labels.length === 1 ? "es mitad" : "son mitades"
  } de una mesa completa`;
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
    const result = await createVisualGroup({ standIds: parsed });
    if (!result.ok) {
      const message =
        result.code === "FULL_TABLE_MEMBER"
          ? `${fullTableHalvesPhrase(result.fullTableStandLabels)}. Separá la mesa desde Gestionar espacios antes de unirla a otro grupo.`
          : {
              TOO_FEW_STANDS: "Seleccioná al menos dos espacios para unirlos",
              STANDS_NOT_FOUND: "No se encontraron todos los espacios",
              NO_SECTOR: "Los espacios deben pertenecer a un sector",
              SECTOR_MISMATCH: "Solo se pueden unir espacios del mismo sector",
              NOT_PLACED_ON_MAP:
                "Los espacios deben estar ubicados en el plano",
              NOT_ALIGNED:
                "Los espacios deben estar alineados en una misma fila o columna",
              CHANGED: CHANGED_MESSAGE,
            }[result.code];
      return { success: false, message };
    }

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");

    return {
      success: true,
      message: "Espacios unidos con éxito",
      groupId: result.groupId,
    };
  } catch (error) {
    console.error("Error grouping stands", error);
    return { success: false, message: "Error al unir los espacios" };
  }
}

/** Releases the given stands from whatever visual group they belong to */
export async function ungroupStands(standIds: number[]): Promise<ActionResult> {
  const auth = await requireFestivalOrAdmin();
  if (!auth.ok) return { success: false, message: auth.message };

  try {
    const parsed = standIdsSchema.parse(standIds);
    const result = await ungroupVisualStands({ standIds: parsed });
    if (!result.ok) {
      const message =
        result.code === "FULL_TABLE_MEMBER"
          ? `${fullTableHalvesPhrase(result.fullTableStandLabels)}. Las mesas completas se separan desde Gestionar espacios.`
          : result.code === "NOT_GROUPED"
            ? "Los espacios seleccionados no están unidos"
            : CHANGED_MESSAGE;
      return { success: false, message };
    }

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");

    return { success: true, message: "Espacios separados con éxito" };
  } catch (error) {
    console.error("Error ungrouping stands", error);
    return { success: false, message: "Error al separar los espacios" };
  }
}
