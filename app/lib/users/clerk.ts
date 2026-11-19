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
 *
 * `deadline` (epoch ms) is when the caller's reservation stops being safe: a
 * newer attempt may be writing to the same account after it, so no write
 * starts past it.
 */
export async function changeClerkUserEmail(
  clerkId: string,
  newEmail: string,
  options: { deadline?: number } = {},
): Promise<ChangeClerkEmailResult> {
  await refuseDuringView();
  const clerk = await clerkClient();
  const outOfTime = () =>
    options.deadline != null && Date.now() >= options.deadline;

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
  // Clerk names the provider "oauth_google" in some payloads and "google" in
  // others.
  const isGoogleOnNewAddress = (
    account: (typeof user.externalAccounts)[number],
  ) =>
    (account.provider === "oauth_google" || account.provider === "google") &&
    !isStaleAccount(account) &&
    account.verification?.status === "verified";

  const current = user.emailAddresses.find(
    (address) => !isStaleAddress(address),
  );
  const settled =
    current != null &&
    current.verification?.status === "verified" &&
    user.primaryEmailAddressId === current.id;
  const staleAddresses = user.emailAddresses.filter(isStaleAddress);
  const staleAccounts = user.externalAccounts.filter(isStaleAccount);

  // The newest read of the account: what the result says is on it.
  let latest = user;
  const done = (unlinked: Iterable<string>, oldAddressesRemoved: boolean) => ({
    status: "changed" as const,
    unlinkedProviders: [...unlinked],
    oldAddressesRemoved,
    passwordEnabled: user.passwordEnabled === true,
    googleOnNewAddress: latest.externalAccounts.some(isGoogleOnNewAddress),
  });

  if (settled && staleAddresses.length === 0 && staleAccounts.length === 0) {
    return done([], true);
  }

  // Nothing written yet, so the account is as it was and a retry starts clean.
  if (!settled && outOfTime()) {
    console.error("Error changing clerk user email", "deadline");
    return { status: "request_failed", detail: "deadline" };
  }

  // The new address goes first. Clerk wants a connected account unlinked
  // before the address it is tied to is deleted, not before another is added,
  // so a failure here leaves the person every way in they had. Nothing has to
  // be linked for the new one: Clerk attaches an OAuth sign-in to this user
  // when the provider's verified email matches a verified address on the
  // account.
  if (current && !settled) {
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
  } else if (!current) {
    try {
      await clerk.emailAddresses.createEmailAddress({
        userId,
        emailAddress: newEmail,
        verified: true,
        primary: true,
      });
    } catch (error) {
      if (hasClerkCode(error, "form_identifier_exists")) {
        return { status: "email_taken" };
      }
      return requestFailed("create_email_address", error);
    }
  }

  // The primary has moved, so from here a failure is reported as leftovers
  // and not as a failed change: the database has to follow Clerk either way.
  let cutShort = false;
  const unlinkedProviders = new Set<string>();

  // A 404 is someone else's removal: nothing written, nothing left.
  const remove = async (step: string, call: () => Promise<unknown>) => {
    if (outOfTime()) {
      if (!cutShort)
        console.error("Error removing old clerk sign-in", "deadline");
      cutShort = true;
      return "failed";
    }
    try {
      await call();
      return "removed";
    } catch (error) {
      if (isNotFound(error)) return "absent";
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
  // "gone" only on Clerk's own word; null when it could not say.
  const readBack = async () => {
    try {
      return (await clerk.users.getUser(clerkId)) ?? ("gone" as const);
    } catch (error) {
      if (isNotFound(error)) return "gone" as const;
      console.error(
        "Error confirming clerk email change",
        `get_user:${clerkErrorCode(error)}`,
      );
      return null;
    }
  };

  // Connected accounts before addresses: Clerk refuses to drop an address
  // that one is linked to.
  for (const account of staleAccounts) await unlink(account);
  for (const address of staleAddresses) await dropAddress(address);
  // Past the deadline even a read only delays the caller's own completion.
  if (cutShort) return done(unlinkedProviders, false);

  // What is left is read back and not inferred from the calls, 404s included:
  // Clerk can answer a delete with success and keep the address, and one may
  // have been added since the first read.
  const fresh = await readBack();
  // The account went while this ran: there is nothing for the database to
  // follow and nobody to tell.
  if (fresh === "gone") return { status: "not_found" };
  if (!fresh) return done(unlinkedProviders, false);
  latest = fresh;

  // One more pass, for what the first read did not have. What it did have was
  // already tried; a second attempt is the admin's to ask for.
  const seen = new Set([
    ...staleAddresses.map((address) => address.id),
    ...staleAccounts.map((account) => account.id),
  ]);
  let leftovers = 0;
  let late = 0;
  for (const account of fresh.externalAccounts.filter(isStaleAccount)) {
    if (seen.has(account.id)) leftovers += 1;
    else {
      late += 1;
      if ((await unlink(account)) === "failed") leftovers += 1;
    }
  }
  for (const address of fresh.emailAddresses.filter(isStaleAddress)) {
    if (seen.has(address.id)) leftovers += 1;
    else {
      late += 1;
      if ((await dropAddress(address)) === "failed") leftovers += 1;
    }
  }
  if (leftovers > 0) return done(unlinkedProviders, false);
  if (late === 0) return done(unlinkedProviders, true);

  // The extra pass is held to the same standard as the first: one last read,
  // and no pass after it.
  const last = await readBack();
  if (last === "gone") return { status: "not_found" };
  if (!last) return done(unlinkedProviders, false);
  latest = last;
  return done(
    unlinkedProviders,
    !last.emailAddresses.some(isStaleAddress) &&
      !last.externalAccounts.some(isStaleAccount),
  );
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
