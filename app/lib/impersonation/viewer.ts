import "server-only";

// The one module that reads who is signed in to Clerk. Everything else asks
// it, so "Entrar como participante" (docs/PLAN-impersonation.md §3) turns
// every viewer lookup into the participant at once. ESLint keeps `auth` and
// `currentUser` from being imported anywhere else.
// eslint-disable-next-line no-restricted-imports
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import type { BaseProfile } from "@/app/api/users/definitions";
import {
  hashImpersonationToken,
  isWellFormedImpersonationToken,
} from "@/app/lib/impersonation/cookie";
import { IMPERSONATION_TOKEN_COOKIE } from "@/app/lib/impersonation/definitions";
import { findLiveImpersonation } from "@/app/lib/impersonation/queries";

export type ClerkSession = { userId: string; sessionId: string };

/**
 * The Clerk session itself: whoever is really signed in. Null when signed
 * out, and outside a request (a static render, a script), where Clerk has
 * nothing to read.
 */
export const getClerkSession = cache(async (): Promise<ClerkSession | null> => {
  try {
    return await readClerkSession();
  } catch (error) {
    // A prerender learns that the page is dynamic from this very throw.
    unstable_rethrow(error);
    return null;
  }
});

/** `getClerkSession` without the safety net, for callers that fail closed. */
const readClerkSession = cache(async (): Promise<ClerkSession | null> => {
  const { userId, sessionId } = await auth();
  return userId && sessionId ? { userId, sessionId } : null;
});

/** Whether anyone is signed in. The same answer while viewing as someone. */
export async function isSignedIn(): Promise<boolean> {
  return (await getClerkSession()) != null;
}

export type Impersonation = {
  /** The `impersonation_sessions` row. */
  sessionId: number;
  /** The global admin who is signed in. */
  actor: BaseProfile;
  /** The participant the app is drawn for. */
  subject: BaseProfile;
  /** Seconds left by the database's clock, for the banner's countdown. */
  secondsLeft: number;
  returnTo: string | null;
};

/** The view cookie's token, or null when there is none or it is not ours. */
async function readToken(): Promise<string | null> {
  const value = (await cookies()).get(IMPERSONATION_TOKEN_COOKIE)?.value;
  return isWellFormedImpersonationToken(value) ? value : null;
}

/**
 * The view this request is in, or null. Only a cookie whose row is live and
 * bound to this very Clerk session, for an admin who is still a global admin
 * and a participant who is still a participant, opens one
 * (`findLiveImpersonation`). Any other cookie is ignored: the request is the
 * signed-in person's own. A render cannot clear it, and it does not need to.
 */
export const getImpersonation = cache(
  async (): Promise<Impersonation | null> => {
    const session = await getClerkSession();
    if (!session) return null;
    let token: string | null;
    try {
      token = await readToken();
    } catch (error) {
      unstable_rethrow(error);
      return null;
    }
    if (!token) return null;

    const live = await findLiveImpersonation({
      tokenHash: hashImpersonationToken(token),
      adminClerkSessionId: session.sessionId,
    });
    // The row is bound to the session; the session to its user. Checked again
    // here so a mismatch can never hand one person's view to another.
    if (!live || live.session.adminClerkId !== session.userId) return null;

    return {
      sessionId: live.session.id,
      actor: live.admin,
      subject: live.subject,
      secondsLeft: live.secondsLeft,
      returnTo: live.session.returnTo,
    };
  },
);

/**
 * The Clerk id every "current user" lookup must use: the participant's
 * while an admin views the app as them, the signed-in person's otherwise.
 * Null when signed out.
 */
export async function getViewerClerkId(): Promise<string | null> {
  const session = await getClerkSession();
  if (!session) return null;
  const impersonation = await getImpersonation();
  return impersonation ? impersonation.subject.clerkId : session.userId;
}

/**
 * Whether this request is a view as someone else, for the read-only guard.
 *
 * Fails closed: once a view cookie is present, a failure to tell whether it
 * is live (the database unreachable, Clerk unreadable) counts as viewing, so
 * a write is refused rather than run as the participant. Without a cookie,
 * or outside a request, nobody is viewing.
 */
export async function isImpersonating(): Promise<boolean> {
  let token: string | null;
  try {
    token = await readToken();
  } catch (error) {
    unstable_rethrow(error);
    // No request: a script, instrumentation.
    return false;
  }
  if (!token) return false;
  try {
    // Signed out, a cookie opens nothing: the request is nobody's view.
    if (!(await readClerkSession())) return false;
    return (await getImpersonation()) != null;
  } catch (error) {
    unstable_rethrow(error);
    return true;
  }
}
