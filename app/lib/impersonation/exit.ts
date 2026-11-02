import "server-only";

import {
  clearImpersonationCookie,
  hashImpersonationToken,
  isWellFormedImpersonationToken,
} from "@/app/lib/impersonation/cookie";
import {
  IMPERSONATION_TOKEN_COOKIE,
  sanitizeImpersonationReturnTo,
} from "@/app/lib/impersonation/definitions";
import {
  endImpersonationSession,
  findOpenImpersonationSession,
} from "@/app/lib/impersonation/queries";
import { getClerkSession } from "@/app/lib/impersonation/viewer";
// eslint-disable-next-line no-restricted-imports -- ending the view is the view's own bookkeeping
import { allowImpersonationWrites } from "@/db/write-guard";

/** Where Salir lands when the view does not say. */
export const EXIT_FALLBACK = "/dashboard";

type CookieStore = {
  get: (name: string) => { value: string } | undefined;
  set: Parameters<typeof clearImpersonationCookie>[0]["set"];
};

export type ExitReason = "exited" | "signed_out";

/**
 * Salir (docs/PLAN-impersonation.md §5.3): ends the view this browser is in
 * and hands back where the admin goes next. It depends on nothing but the
 * cookie and the Clerk session, never on an admin page: inside a view the
 * admin pages do not open.
 *
 * Idempotent: without a view, or with one that already ran out, it only
 * clears the cookie. A view bound to another Clerk session is never ended
 * from here; the cookie is cleared all the same, since it opens nothing for
 * this session.
 */
export async function exitImpersonation(
  store: CookieStore,
  reason: ExitReason,
): Promise<{ returnTo: string; ended: boolean }> {
  const session = await getClerkSession();
  const value = store.get(IMPERSONATION_TOKEN_COOKIE)?.value;
  let returnTo = session ? EXIT_FALLBACK : "/";
  let ended = false;

  if (session && isWellFormedImpersonationToken(value)) {
    const row = await findOpenImpersonationSession(
      hashImpersonationToken(value),
    );
    if (
      row &&
      row.adminClerkSessionId === session.sessionId &&
      row.adminClerkId === session.userId
    ) {
      // The request still carries the view's cookie, so the guard would
      // refuse this write without the scope.
      ended = await allowImpersonationWrites(() =>
        endImpersonationSession({ id: row.id, reason }),
      );
      returnTo = sanitizeImpersonationReturnTo(row.returnTo) ?? EXIT_FALLBACK;
    }
  }

  clearImpersonationCookie(store);
  return { returnTo, ended };
}
