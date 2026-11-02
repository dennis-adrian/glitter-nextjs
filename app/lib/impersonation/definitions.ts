import type { BaseProfile } from "@/app/api/users/definitions";

/**
 * "Entrar como participante" (docs/PLAN-impersonation.md). Client-safe:
 * constants, types and pure helpers only, no database and no secrets.
 */

/** How long one view lasts. The cookie and the row expire together. */
export const IMPERSONATION_DURATION_MINUTES = 60;
export const IMPERSONATION_DURATION_SECONDS =
  IMPERSONATION_DURATION_MINUTES * 60;

/** httpOnly: the opaque token whose SHA-256 the row keeps. */
export const IMPERSONATION_TOKEN_COOKIE = "glitter_view_as";

/** Only participants can be viewed as. Staff accounts never. */
export const IMPERSONATABLE_ROLES = [
  "user",
] as const satisfies readonly BaseProfile["role"][];

export const IMPERSONATION_SESSION_STATES = [
  "active",
  "exited",
  "signed_out",
  "expired",
] as const;
export type ImpersonationSessionState =
  (typeof IMPERSONATION_SESSION_STATES)[number];

export const IMPERSONATION_STATE_LABELS: Record<
  ImpersonationSessionState,
  string
> = {
  active: "En curso",
  exited: "Salió",
  signed_out: "Cerró sesión",
  expired: "Terminó sola",
};

/** Why a view cannot start, in the order the checks run. */
export const IMPERSONATION_REFUSALS = [
  "not_admin",
  "already_viewing",
  "not_found",
  "self",
  "staff",
  "not_participant",
  "deleting",
] as const;
export type ImpersonationRefusal = (typeof IMPERSONATION_REFUSALS)[number];

export const IMPERSONATION_REFUSAL_MESSAGES: Record<
  ImpersonationRefusal,
  string
> = {
  not_admin: "No tenés permiso para entrar como otra cuenta.",
  already_viewing: "Ya estás viendo la app como otra cuenta. Salí primero.",
  not_found: "No encontramos esa cuenta.",
  self: "Ya estás en tu propia cuenta.",
  staff: "No se puede entrar como una cuenta de administración.",
  not_participant: "Solo se puede entrar como participantes.",
  deleting: "Esta cuenta se está eliminando.",
};

/** What the read-only guard answers when something tries to save. */
export const IMPERSONATION_READ_ONLY_MESSAGE =
  "Estás viendo la app como otra cuenta: solo lectura.";

/** One row of "Recientes", as the picker and a person's admin page list it. */
export type RecentImpersonation = {
  id: number;
  state: ImpersonationSessionState;
  startedAt: Date;
  /** Until Salir, the end of the hour, or now while it is on. */
  durationSeconds: number;
  blockedWrites: number;
  admin: ImpersonationPerson | null;
  subject: ImpersonationPerson | null;
};

export type ImpersonationPerson = Pick<
  BaseProfile,
  "id" | "displayName" | "firstName" | "lastName" | "email" | "imageUrl"
>;

const MAX_RETURN_TO_LENGTH = 512;
const SANITIZE_BASE = "http://glitter.invalid";

/**
 * Where Salir may send the admin back to: an admin page of this site, or
 * nothing. Anything else (another origin, a protocol-relative URL, a path that
 * only starts with the letters, one that climbs out with `..`) is dropped, so
 * the stored value can never be turned into an open redirect.
 */
export function sanitizeImpersonationReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_RETURN_TO_LENGTH) return null;
  // Browsers read a backslash as a slash, and control characters are never
  // part of a path we produce.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;

  let url: URL;
  try {
    url = new URL(value, SANITIZE_BASE);
  } catch {
    return null;
  }
  if (url.origin !== SANITIZE_BASE) return null;
  const { pathname } = url;
  if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/")) {
    return null;
  }
  return `${pathname}${url.search}${url.hash}`;
}
