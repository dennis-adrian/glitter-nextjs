import type { CredentialsResult } from "@/app/lib/credentials/definitions";

/**
 * Storybook's stand-in (`sb.mock` in .storybook/preview.tsx): the real
 * actions are server code, so stories answer "saved" without a network.
 * One export per action in app/lib/credentials/actions.ts.
 */

const saved = (message: string) => async (): Promise<CredentialsResult> => ({
  success: true,
  message,
});

export const saveCredentialRules = saved("Reglas guardadas.");
export const resetCredentialRules = saved("Volvimos a los valores por defecto.");
export const setExternalCredentialQuantity = saved("Cantidad guardada.");
export const createStaffMember = saved("Se sumó al equipo.");
export const updateStaffMember = saved("Cambios guardados.");
export const archiveStaffMember = saved("Archivada.");
export const restoreStaffMember = saved("La persona volvió a la lista del equipo.");
export const setFestivalStaffMember = saved("Marcada para esta edición.");
export const addExtraCredential = saved("Credencial agregada.");
export const updateExtraCredential = saved("Cambios guardados.");
export const removeExtraCredential = saved("Credencial quitada.");
export const createCredentialPrintBatch = saved(
  "Marcaste 8 credenciales como enviadas a imprenta.",
);
export const deleteCredentialPrintBatch = saved("Deshiciste el último envío a imprenta.");
