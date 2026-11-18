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
  const userId = user.id;

  try {
    const holders = await clerk.users.getUserList({ emailAddress: [newEmail] });
    if (holders.data.some((holder) => holder.id !== userId)) {
      return { status: "email_taken" };
    }
  } catch (error) {
    return requestFailed("list_users", error);
  }

  const isStaleAddress = (address: { emailAddress: string }) =>
    normalizeEmail(address.emailAddress) !== newEmail;
  // An account already on the new address stays.
  const isStaleAccount = (account: { emailAddress?: string | null }) =>
    normalizeEmail(account.emailAddress ?? "") !== newEmail;

  const current = user.emailAddresses.find(
    (address) => !isStaleAddress(address),
  );
  const settled =
    current != null &&
    current.verification?.status === "verified" &&
    user.primaryEmailAddressId === current.id;
  const staleAddresses = user.emailAddresses.filter(isStaleAddress);
  const staleAccounts = user.externalAccounts.filter(isStaleAccount);

  const done = (unlinked: Iterable<string>, oldAddressesRemoved: boolean) => ({
    status: "changed" as const,
    unlinkedProviders: [...unlinked],
    oldAddressesRemoved,
    passwordEnabled: user.passwordEnabled === true,
  });

  if (settled && staleAddresses.length === 0 && staleAccounts.length === 0) {
    return done([], true);
  }

  // The new address goes first. Clerk wants a connected account unlinked
  // before the address it is tied to is deleted, not before another is added,
  // so a failure here leaves the person every way in they had. Nothing has to
  // be linked for the new one: Clerk attaches an OAuth sign-in to this user
  // when the provider's verified email matches a verified address on the
  // account.
  let wrote = false;
  if (current && !settled) {
    try {
      await clerk.emailAddresses.updateEmailAddress(current.id, {
        verified: true,
        primary: true,
      });
      wrote = true;
    } catch (error) {
      if (hasClerkCode(error, "form_identifier_exists")) {
        return { status: "email_taken" };
      }
      return requestFailed("update_email_address", error);
    }
  } else if (!current) {
    try {
      await clerk.emailAddresses.createEmailAddress({
        userId,
        emailAddress: newEmail,
        verified: true,
        primary: true,
      });
      wrote = true;
    } catch (error) {
      if (hasClerkCode(error, "form_identifier_exists")) {
        return { status: "email_taken" };
      }
      return requestFailed("create_email_address", error);
    }
  }

  // The primary has moved, so from here a failure is reported as leftovers
  // and not as a failed change: the database has to follow Clerk either way.
  let failed = false;
  const unlinkedProviders = new Set<string>();

  // A 404 is someone else's removal: nothing written, nothing left.
  const remove = async (step: string, call: () => Promise<unknown>) => {
    try {
      await call();
      wrote = true;
      return "removed";
    } catch (error) {
      if (isNotFound(error)) return "absent";
      failed = true;
      console.error(
        "Error removing old clerk sign-in",
        `${step}:${clerkErrorCode(error)}`,
      );
      return "failed";
    }
  };
  const unlink = async (account: (typeof user.externalAccounts)[number]) => {
    const outcome = await remove("unlink_external_account", () =>
      clerk.users.deleteUserExternalAccount({
        userId,
        // Google and Facebook carry the deletable eac_ id apart from `id`.
        externalAccountId: account.externalAccountId ?? account.id,
      }),
    );
    // Only what this call removed: a 404 unlinked nothing.
    if (outcome === "removed") unlinkedProviders.add(account.provider);
    return outcome;
  };
  const dropAddress = (address: { id: string }) =>
    remove("delete_email_address", () =>
      clerk.emailAddresses.deleteEmailAddress(address.id),
    );

  // Connected accounts before addresses: Clerk refuses to drop an address
  // that one is linked to.
  for (const account of staleAccounts) await unlink(account);
  for (const address of staleAddresses) await dropAddress(address);

  if (!wrote && !failed) return done(unlinkedProviders, true);

  // What is left is read back and not inferred from the calls: Clerk can
  // answer a delete with success and keep the address, and one may have been
  // added since the first read.
  let fresh;
  try {
    fresh = await clerk.users.getUser(clerkId);
  } catch (error) {
    console.error(
      "Error confirming clerk email change",
      `get_user:${clerkErrorCode(error)}`,
    );
  }
  if (!fresh) return done(unlinkedProviders, false);

  // One more pass, for what the first read did not have. What it did have was
  // already tried; a second attempt is the admin's to ask for.
  const seen = new Set([
    ...staleAddresses.map((address) => address.id),
    ...staleAccounts.map((account) => account.id),
  ]);
  let leftovers = 0;
  for (const account of fresh.externalAccounts.filter(isStaleAccount)) {
    if (seen.has(account.id) || (await unlink(account)) === "failed") {
      leftovers += 1;
    }
  }
  for (const address of fresh.emailAddresses.filter(isStaleAddress)) {
    if (seen.has(address.id) || (await dropAddress(address)) === "failed") {
      leftovers += 1;
    }
  }

  return done(unlinkedProviders, leftovers === 0);
}
