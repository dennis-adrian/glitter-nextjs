/**
 * Reasons the code fills in when no admin typed one. The email still shows
 * them; participant screens and the inbox do not present them as the team's
 * reason.
 */
const PLACEHOLDER_REASONS = new Set([
  "Actualización administrativa",
  "Cancelado desde el estado de pago",
  "Revisión administrativa",
]);

/** The reason an admin actually wrote when closing a reservation, or null. */
export function adminCancellationReason(reason: unknown): string | null {
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  if (!trimmed || PLACEHOLDER_REASONS.has(trimmed)) return null;
  return trimmed;
}
