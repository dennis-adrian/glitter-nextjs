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
 * - `unknown`: neither could be confirmed. A timeout lands here even when a
 *   follow-up read finds the login, because the abandoned request may still
 *   reach Clerk afterwards.
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
 * `deleteClerkUser` reports any error other than a 404 as a failure, but a
 * reset connection or a 5xx can arrive after Clerk applied the delete. So a
 * failure is followed by a read of the login before anyone concludes that
 * nothing changed. `totalMs` bounds both together, since the caller holds a
 * row lock for the whole step: the delete gets two thirds, the read the rest.
 */
export async function deleteClerkLogin(
  clerkId: string,
  totalMs = CLERK_CALL_TIMEOUT_MS,
): Promise<ClerkDeletionOutcome> {
  const startedAt = Date.now();
  const deleteMs = Math.max(1, Math.floor((totalMs * 2) / 3));
  let timedOut = false;
  let failure = "clerk_delete_failed";
  try {
    const result = await within(deleteClerkUser(clerkId), deleteMs);
    if (result === TIMED_OUT) {
      timedOut = true;
      failure = "clerk_delete_failed: timed out";
    } else if (result.status !== "request_failed") {
      // "deleted" or "already_deleted": keyed on the status, as every caller
      // of deleteClerkUser has been.
      return { kind: "deleted" };
    } else {
      failure = `clerk_delete_failed: ${result.message}`;
    }
  } catch (error) {
    failure = `clerk_delete_failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  const remainingMs = totalMs - (Date.now() - startedAt);
  const status =
    remainingMs > 0 ? await checkClerkLogin(clerkId, remainingMs) : "unknown";
  if (status === "gone") return { kind: "deleted" };
  if (status === "exists" && !timedOut) {
    return { kind: "not_deleted", message: failure };
  }
  return { kind: "unknown", message: failure };
}
