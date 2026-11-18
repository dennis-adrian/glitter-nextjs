import "server-only";

import { clerkLoginStatus, deleteClerkUser } from "@/app/lib/users/clerk";

/**
 * Clerk exposes no request timeout. A profile deletion asks it while holding
 * the account's row, so a hung call is bounded like the cron's
 * (`profile_tasks/actions.ts`).
 */
export const CLERK_CALL_TIMEOUT_MS = 10_000;

/**
 * What became of the Clerk login, as far as can be known.
 *
 * - `deleted`: gone, whether this call removed it or an earlier one did.
 * - `not_deleted`: Clerk answered that the login still exists, so nothing was
 *   removed and the person can still sign in.
 * - `unknown`: neither could be confirmed. A timeout, a 5xx or a dropped
 *   connection lands here even when a follow-up read finds the login, because
 *   that request may still be applied after the read.
 */
export type ClerkDeletionOutcome =
  | { kind: "deleted" }
  | { kind: "not_deleted"; message: string }
  | { kind: "unknown"; message: string };

const TIMED_OUT = Symbol("timed out");

async function within<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Whether the login still exists, bounded; any failure is "unknown". */
export async function checkClerkLogin(
  clerkId: string,
  timeoutMs = CLERK_CALL_TIMEOUT_MS,
): Promise<"exists" | "gone" | "unknown"> {
  try {
    const status = await within(clerkLoginStatus(clerkId), timeoutMs);
    return status === TIMED_OUT ? "unknown" : status;
  } catch (error) {
    console.error("Error checking clerk login", error);
    return "unknown";
  }
}

/**
 * Deletes the Clerk login and says what is known afterwards.
 *
 * A failure is followed by a read of the login: a reset connection or a 5xx
 * can arrive after Clerk applied the delete. Only a definite refusal (a 4xx,
 * or a request never sent) plus a read that finds the login means nothing
 * changed; any other failure stays unknown, as the request may still land.
 * `totalMs` bounds both together, since the caller holds a row lock for the
 * whole step: the delete gets two thirds, the read the rest. On a timeout the
 * delete is told to stop, so it is not sent later if it has not been yet.
 */
export async function deleteClerkLogin(
  clerkId: string,
  totalMs = CLERK_CALL_TIMEOUT_MS,
): Promise<ClerkDeletionOutcome> {
  const startedAt = Date.now();
  const deleteMs = Math.max(1, Math.floor((totalMs * 2) / 3));
  const abandon = new AbortController();
  // Whether the request may have been applied although no success came back.
  let ambiguous = false;
  let failure = "clerk_delete_failed";
  try {
    const result = await within(
      deleteClerkUser(clerkId, abandon.signal),
      deleteMs,
    );
    if (result === TIMED_OUT) {
      abandon.abort();
      ambiguous = true;
      failure = "clerk_delete_failed: timed out";
    } else if (result.status !== "request_failed") {
      // "deleted" or "already_deleted": keyed on the status, as every caller
      // of deleteClerkUser has been.
      return { kind: "deleted" };
    } else {
      ambiguous = !result.definite;
      failure = `clerk_delete_failed: ${result.message}`;
    }
  } catch (error) {
    // Thrown before anything was sent (a refused write during a view, a
    // client that could not be built): nothing reached Clerk.
    failure = `clerk_delete_failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  const remainingMs = totalMs - (Date.now() - startedAt);
  const status =
    remainingMs > 0 ? await checkClerkLogin(clerkId, remainingMs) : "unknown";
  if (status === "gone") return { kind: "deleted" };
  if (status === "exists" && !ambiguous) {
    return { kind: "not_deleted", message: failure };
  }
  return { kind: "unknown", message: failure };
}
