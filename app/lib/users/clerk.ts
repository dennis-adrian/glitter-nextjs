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
    };

export async function deleteClerkUser(
  clerkId: string,
): Promise<DeleteClerkUserResult> {
  // Refused before Clerk is asked while an admin views the app as someone
  // (docs/PLAN-impersonation.md §6.2); it throws, like a refused write.
  await refuseDuringView();
  try {
    const clerk = await clerkClient();
    const existingUser = await clerk.users.getUser(clerkId);
    if (!existingUser) {
      console.log("Clerk user not found");
      return {
        success: true,
        status: "already_deleted" as const,
        message: "Usuario no encontrado",
      };
    }

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
