import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient } from "@clerk/nextjs/server";

import { refuseDuringView } from "@/db/write-guard";

type DeleteClerkUserResult =
  | {
      success: true;
      status: "deleted" | "already_deleted";
      message: string;
    }
  | {
      success: false;
      status: "request_failed";
      message: string;
      /**
       * True when the login certainly was not deleted: Clerk answered with a
       * refusal (4xx), or the request was never sent. False when the request
       * may have reached Clerk and been applied (a 5xx, a dropped connection).
       */
      definite: boolean;
    };

/**
 * Deletes the Clerk login with a single request.
 *
 * `signal` is the caller giving up: once it is aborted, the DELETE is not
 * sent. The Clerk SDK cannot cancel a request already on its way, so a caller
 * that stopped waiting still cannot know whether one was sent before then.
 */
export async function deleteClerkUser(
  clerkId: string,
  signal?: AbortSignal,
): Promise<DeleteClerkUserResult> {
  // Refused before Clerk is asked while an admin views the app as someone
  // (docs/PLAN-impersonation.md §6.2); it throws, like a refused write.
  await refuseDuringView();
  try {
    const clerk = await clerkClient();
    // Last moment to stop: a caller that already gave up must not have its
    // deletion land later, after it has reported the account as kept.
    if (signal?.aborted) {
      return {
        success: false,
        status: "request_failed",
        message: "no enviado: se agotó el tiempo",
        definite: true,
      };
    }
    // One request, no read first: a 404 means the login is already gone, and
    // a read before the delete would only widen the time in which a request
    // the caller gave up on could still be sent.
    await clerk.users.deleteUser(clerkId);
    return {
      success: true,
      status: "deleted" as const,
      message: "Cuenta eliminada correctamente.",
    };
  } catch (error) {
    if (isClerkAPIResponseError(error) && error.status === 404) {
      return {
        success: true,
        status: "already_deleted" as const,
        message: "Usuario no encontrado",
      };
    }

    console.error("Error deleting clerk user", error);
    return {
      success: false,
      status: "request_failed",
      message: "Error al eliminar la cuenta.",
      // Only an answer from Clerk refusing the request settles it.
      definite:
        isClerkAPIResponseError(error) &&
        error.status >= 400 &&
        error.status < 500,
    };
  }
}

/**
 * Whether the Clerk login still exists. "unknown" when Clerk could not say:
 * a caller deciding whether a person can still sign in must not read a failed
 * request as either answer.
 */
export async function clerkLoginStatus(
  clerkId: string,
): Promise<"exists" | "gone" | "unknown"> {
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(clerkId);
    return user ? "exists" : "gone";
  } catch (error) {
    if (isClerkAPIResponseError(error) && error.status === 404) return "gone";
    console.error("Error reading clerk user", error);
    return "unknown";
  }
}
