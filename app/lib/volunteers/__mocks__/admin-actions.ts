import type { VolunteerAdminResult } from "@/app/lib/volunteers/admin-definitions";

/**
 * Storybook's stand-in (`sb.mock` in .storybook/preview.tsx): the real
 * actions are server code, so stories answer "saved" without a network.
 * One export per action in app/lib/volunteers/admin-actions.ts.
 */

const saved = (message: string) => async (): Promise<VolunteerAdminResult> => ({
  success: true,
  message,
});

export const updateVolunteerApplicationStatus = saved("Estado actualizado.");
export const saveVolunteerReview = saved("Cambios guardados.");
export const updateVolunteerCallSettings = saved("Fechas guardadas.");
export const saveVolunteerRole = saved("Rol guardado.");
export const setVolunteerRoleActive = saved("Rol actualizado.");
export const moveVolunteerRole = saved("Orden actualizado.");
export const saveVolunteerShift = saved("Turno guardado.");
export const setVolunteerShiftActive = saved("Turno actualizado.");
export const assignVolunteerShift = saved("Turno asignado.");
export const unassignVolunteerShift = saved(
  "Quitamos a la persona de este turno.",
);
