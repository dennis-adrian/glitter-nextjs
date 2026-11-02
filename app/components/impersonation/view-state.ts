"use client";

import { useSyncExternalStore } from "react";

import { forgetThisBrowserForPush } from "@/app/components/notifications/use-push-device";

/**
 * "Entrar como participante" on the client (docs/PLAN-impersonation.md §7.4):
 * whether this browser is viewing the app as a participant, for the parts of
 * the page that behave differently then (the avisos controls). The banner
 * fills it from the server's answer; nothing here is trusted by the server,
 * which decides every refusal on its own.
 */

export type ViewedPerson = {
  id: number;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  imageUrl: string | null;
};

export type ViewState = { subject: ViewedPerson; secondsLeft: number } | null;

let current: ViewState = null;
const listeners = new Set<() => void>();

export function setViewState(next: ViewState) {
  if (current === next) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The view this browser is in, or null; null on the server. */
export function useViewState(): ViewState {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

export function isViewingNow(): boolean {
  return current != null;
}

const EXIT_URL = "/api/impersonation/exit";

/**
 * Ends this browser's view and answers where the admin goes next, or null
 * when the request failed. Idempotent: without a view it only makes sure no
 * view cookie is left.
 */
export async function endView(
  reason: "exited" | "signed_out" = "exited",
): Promise<string | null> {
  try {
    const response = await fetch(EXIT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { returnTo?: unknown };
    return typeof body.returnTo === "string" ? body.returnTo : null;
  } catch {
    return null;
  }
}

/**
 * What every sign-out does before Clerk's: ends a view first, recorded as a
 * sign-out, so the browser's avisos are then forgotten for the admin who is
 * really signed in rather than for the participant they were viewing as.
 * Always asks the server, which knows about a view even before the banner
 * has loaded; a failure never holds the sign-out up.
 */
export async function prepareSignOut() {
  await endView("signed_out");
  setViewState(null);
  await forgetThisBrowserForPush();
}
