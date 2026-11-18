import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient } from "@clerk/nextjs/server";

import {
  normalizeEmail,
  type ChangeClerkEmailResult,
} from "@/app/lib/users/email-change-definitions";
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

function isNotFound(error: unknown) {
  return isClerkAPIResponseError(error) && error.status === 404;
}

function hasClerkCode(error: unknown, code: string) {
  return (
    isClerkAPIResponseError(error) &&
    error.errors.some((entry) => entry.code === code)
  );
}

/**
 * Clerk's error code, or the HTTP status when there is none. Clerk's messages
 * can quote the address, so this is the only part that is logged or stored.
 */
function clerkErrorCode(error: unknown) {
  if (!isClerkAPIResponseError(error)) return "unknown";
  const code = error.errors[0]?.code;
  return code && /^[a-z0-9_]+$/i.test(code) ? code : String(error.status);
}

function requestFailed(step: string, error: unknown): ChangeClerkEmailResult {
  const detail = `${step}:${clerkErrorCode(error)}`;
  console.error("Error changing clerk user email", detail);
  return { status: "request_failed", detail };
}

/**
 * Makes `newEmail` (already normalized) the only address the account signs in
 * with. Safe to run again: each step looks at what is on the account now, so
 * a retry after a half-done attempt picks up where it stopped, and a retry
 * after a finished one writes nothing.
 */
export async function changeClerkUserEmail(
  clerkId: string,
  newEmail: string,
): Promise<ChangeClerkEmailResult> {
  await refuseDuringView();
  const clerk = await clerkClient();

  let user;
  try {
    user = await clerk.users.getUser(clerkId);
  } catch (error) {
    if (isNotFound(error)) return { status: "not_found" };
    return requestFailed("get_user", error);
  }
  if (!user) return { status: "not_found" };

  try {
    const holders = await clerk.users.getUserList({ emailAddress: [newEmail] });
    if (holders.data.some((holder) => holder.id !== user.id)) {
      return { status: "email_taken" };
    }
  } catch (error) {
    return requestFailed("list_users", error);
  }

  // Connected accounts go first: Clerk refuses to drop an address that one is
  // linked to. An account already on the new address stays. Nothing has to be
  // linked for the new one: Clerk attaches an OAuth sign-in to this user when
  // the provider's verified email matches a verified address on the account,
  // so "Sign in with Google" works with the new address's Google account.
  const unlinkedProviders = new Set<string>();
  for (const account of user.externalAccounts) {
    if (normalizeEmail(account.emailAddress ?? "") === newEmail) continue;
    try {
      await clerk.users.deleteUserExternalAccount({
        userId: user.id,
        // Google and Facebook carry the deletable eac_ id apart from `id`.
        externalAccountId: account.externalAccountId ?? account.id,
      });
    } catch (error) {
      if (!isNotFound(error)) {
        return requestFailed("unlink_external_account", error);
      }
    }
    unlinkedProviders.add(account.provider);
  }

  const current = user.emailAddresses.find(
    (address) => normalizeEmail(address.emailAddress) === newEmail,
  );
  let currentId = current?.id;
  if (current) {
    const settled =
      current.verification?.status === "verified" &&
      user.primaryEmailAddressId === current.id;
    if (!settled) {
      try {
        await clerk.emailAddresses.updateEmailAddress(current.id, {
          verified: true,
          primary: true,
        });
      } catch (error) {
        if (hasClerkCode(error, "form_identifier_exists")) {
          return { status: "email_taken" };
        }
        return requestFailed("update_email_address", error);
      }
    }
  } else {
    try {
      const created = await clerk.emailAddresses.createEmailAddress({
        userId: user.id,
        emailAddress: newEmail,
        verified: true,
        primary: true,
      });
      currentId = created.id;
    } catch (error) {
      if (hasClerkCode(error, "form_identifier_exists")) {
        return { status: "email_taken" };
      }
      return requestFailed("create_email_address", error);
    }
  }

  // The primary has moved, so from here a failure is reported as leftovers
  // and not as a failed change: the database has to follow Clerk either way.
  let oldAddressesRemoved = true;
  for (const address of user.emailAddresses) {
    if (address.id === currentId) continue;
    try {
      await clerk.emailAddresses.deleteEmailAddress(address.id);
    } catch (error) {
      if (isNotFound(error)) continue;
      oldAddressesRemoved = false;
      console.error(
        "Error removing old clerk email address",
        `delete_email_address:${clerkErrorCode(error)}`,
      );
    }
  }

  return {
    status: "changed",
    unlinkedProviders: [...unlinkedProviders],
    oldAddressesRemoved,
  };
}
