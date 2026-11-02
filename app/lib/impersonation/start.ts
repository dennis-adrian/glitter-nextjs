import "server-only";

import { z } from "zod";

import {
  getPostHogClient,
  POSTHOG_SHUTDOWN_TIMEOUT_MS,
} from "@/app/lib/posthog-server";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import {
  hashImpersonationToken,
  newImpersonationToken,
  setImpersonationCookie,
} from "@/app/lib/impersonation/cookie";
import {
  IMPERSONATION_REFUSAL_MESSAGES,
  sanitizeImpersonationReturnTo,
} from "@/app/lib/impersonation/definitions";
import { impersonationRefusal } from "@/app/lib/impersonation/eligibility";
import {
  createImpersonationSession,
  loadImpersonationTarget,
} from "@/app/lib/impersonation/queries";
import {
  getClerkSession,
  getImpersonation,
} from "@/app/lib/impersonation/viewer";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";

export type StartImpersonationResult =
  | { success: true; redirectTo: string }
  | { success: false; message: string };

const inputSchema = z.object({
  subjectId: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
  returnTo: z.unknown().optional(),
});

/** Where a view opens: the participant's own Inicio. */
const VIEW_HOME = "/portal";

type CookieWriter = Parameters<typeof setImpersonationCookie>[0];

/**
 * "Entrar como participante" (docs/PLAN-impersonation.md §5.1): a global
 * admin starts viewing the app as `subjectId`, read-only, for an hour.
 *
 * Served by `POST /api/impersonation/start`, not a Server Action: an action
 * that sets a cookie makes Next render the current page again in the same
 * response, and that render would already be the participant's, on an admin
 * page whose layout redirects them away.
 *
 * Everything is checked here, on the server, against the signed-in person
 * themself: only a global admin, not from inside another view, never
 * themself or a staff account, never an account being deleted. The client
 * then loads `redirectTo` as a whole new document (`window.location`), so no
 * cache keyed on the admin's Clerk id outlives the switch.
 */
export async function startImpersonation(
  input: unknown,
  store: CookieWriter,
): Promise<StartImpersonationResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Datos inválidos." };

  const [session, current, actor] = await Promise.all([
    getClerkSession(),
    getImpersonation(),
    // Outside a view, the profile the request is for is the admin's own.
    getCurrentUserProfile(),
  ]);
  const actorIsViewing = current != null;
  const { subject, pendingDeletion } = await loadImpersonationTarget(
    parsed.data.subjectId,
  );
  const refusal = impersonationRefusal({
    actor: session && !actorIsViewing ? actor : null,
    actorIsViewing,
    subject,
    subjectPendingDeletion: pendingDeletion,
  });
  // Already viewing is told apart from "not an admin": the actor resolves
  // as the participant then, who is not one.
  if (actorIsViewing) {
    return {
      success: false,
      message: IMPERSONATION_REFUSAL_MESSAGES.already_viewing,
    };
  }
  if (refusal || !session || !actor || !subject) {
    return {
      success: false,
      message: IMPERSONATION_REFUSAL_MESSAGES[refusal ?? "not_admin"],
    };
  }

  const token = newImpersonationToken();
  const created = await createImpersonationSession({
    adminUserId: actor.id,
    adminClerkId: session.userId,
    subjectUserId: subject.id,
    subjectClerkId: subject.clerkId,
    adminClerkSessionId: session.sessionId,
    tokenHash: hashImpersonationToken(token),
    returnTo: sanitizeImpersonationReturnTo(parsed.data.returnTo),
  });
  if (!created) {
    return { success: false, message: "No se pudo entrar. Intentá de nuevo." };
  }
  setImpersonationCookie(store, token);

  try {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: session.userId,
      event: POSTHOG_EVENTS.IMPERSONATION_STARTED,
      properties: { subject_id: subject.id, session_id: created.id },
    });
    await posthog.shutdown(POSTHOG_SHUTDOWN_TIMEOUT_MS);
  } catch (telemetryError) {
    console.error(
      "PostHog telemetry failed (startImpersonation)",
      telemetryError,
    );
  }

  return { success: true, redirectTo: VIEW_HOME };
}
