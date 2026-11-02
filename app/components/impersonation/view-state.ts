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

/**
 * Tells this browser's other tabs that a view started or ended. They share
 * the cookie, so what they show from their next navigation on is someone
 * else's; each one draws itself again (see `useViewChangesFromOtherTabs`).
 */
const CHANNEL = "glitter:impersonation";
/**
 * This document's own id. A message reaches every other channel object,
 * this tab's own listener included, which must not reload the page that is
 * already on its way to the admin's.
 */
const TAB_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Math.random());

export function announceViewChange() {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ from: TAB_ID });
    channel.close();
  } catch {
    // No BroadcastChannel: the other tabs find out on focus instead.
  }
}

/** Reloads this tab when another one starts or ends a view. */
export function listenForViewChanges(onChange: () => void): () => void {
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    return () => {};
  }
  channel.onmessage = (event: MessageEvent<{ from?: unknown }>) => {
    if (event.data?.from !== TAB_ID) onChange();
  };
  return () => channel.close();
}

const EXIT_URL = "/api/impersonation/exit";
const EXIT_TIMEOUT_MS = 5_000;

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
      // A sign-out waits for this: a slow server must not hold it up.
      signal: AbortSignal.timeout(EXIT_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    announceViewChange();
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
