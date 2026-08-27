import type { CategoryVisibility } from "@/app/lib/categories/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { MANAGEMENT_AREAS, isManagementArea, type ManagementArea } from "./definitions";

export const VISIBILITY_COPY: Record<
  CategoryVisibility,
  { controlLabel: string; listLabel: string; help: string }
> = {
  hidden: {
    controlLabel: "Oculta",
    listLabel: "Oculta",
    help: "No aparece en la página pública ni en ningún selector.",
  },
  listed: {
    controlLabel: "Visible, cerrada",
    listLabel: "Cerrada",
    help: "Aparece en la página pública, pero no se puede elegir al inscribirse.",
  },
  selectable: {
    controlLabel: "Activa",
    listLabel: "Activa",
    help: "Aparece en la página pública y en el selector de participantes.",
  },
};

export const PUBLIC_CLOSED_CAPTION =
  "No disponible para nuevas inscripciones";

export const RENAME_MOVE_WARNING =
  "Esta categoría ya está asignada a perfiles o stands. Cambiar el nombre o el área actualizará esas asignaciones.";

export const MANAGEMENT_AREA_OPTIONS = MANAGEMENT_AREAS.map((value) => ({
  value,
  label: getCategoryLabel(value),
}));

export function visibilityTone(
  visibility: CategoryVisibility,
): "neutral" | "warning" | "success" {
  if (visibility === "selectable") return "success";
  if (visibility === "listed") return "warning";
  return "neutral";
}

export function formatDeleteBlockedMessage(
  label: string,
  verifiedCount: number,
  pausedCount: number,
  standCount: number,
): string {
  const reasons: string[] = [];
  if (verifiedCount > 0) {
    reasons.push(
      `${verifiedCount} ${verifiedCount === 1 ? "perfil verificado" : "perfiles verificados"}`,
    );
  }
  if (pausedCount > 0) {
    reasons.push(
      `${pausedCount} ${pausedCount === 1 ? "perfil pausado" : "perfiles pausados"}`,
    );
  }
  if (standCount > 0) {
    reasons.push(`${standCount} ${standCount === 1 ? "stand" : "stands"}`);
  }
  const joined =
    reasons.length > 1
      ? `${reasons.slice(0, -1).join(", ")} y ${reasons[reasons.length - 1]}`
      : reasons[0] ?? "";
  const total = verifiedCount + pausedCount + standCount;
  return `No se puede eliminar ${label} porque ${joined} la ${total === 1 ? "usa" : "usan"}.`;
}

export function formatDeleteWarningMessage(counts: {
  pending: number;
  rejected: number;
  banned: number;
}): string | null {
  const parts: string[] = [];
  if (counts.pending > 0) {
    parts.push(
      `${counts.pending} ${counts.pending === 1 ? "pendiente" : "pendientes"}`,
    );
  }
  if (counts.rejected > 0) {
    parts.push(
      `${counts.rejected} ${counts.rejected === 1 ? "rechazado" : "rechazados"}`,
    );
  }
  if (counts.banned > 0) {
    parts.push(
      `${counts.banned} ${counts.banned === 1 ? "deshabilitado" : "deshabilitados"}`,
    );
  }

  const total = counts.pending + counts.rejected + counts.banned;
  if (total === 0) return null;

  return `Esta acción no se puede deshacer. Hay ${total} ${
    total === 1 ? "perfil no verificado" : "perfiles no verificados"
  } (${parts.join(", ")}) que perderán esta categoría.`;
}

export function areaLabel(area: ManagementArea): string {
  return getCategoryLabel(area);
}

export const UNIQUE_LABEL_MESSAGE =
  "Ya existe una categoría con ese nombre en esta área";

export function categoryParticipantsHref(area: string): string {
  const params = new URLSearchParams({
    limit: "10",
    offset: "0",
    includeAdmins: "false",
    sort: "updatedAt",
    direction: "desc",
  });
  if (isManagementArea(area)) {
    params.set("category", area);
  }
  return `/dashboard/users?${params.toString()}`;
}
