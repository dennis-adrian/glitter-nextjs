import "server-only";

import type { InvitationKind } from "@/app/lib/festivals/invitation-definitions";

/**
 * One Resend batch request per page: Resend's own ceiling
 * (`RESEND_BATCH_MAX_EMAILS`), so a page is never split.
 */
export const INVITATION_PAGE_SIZE = 100;

/**
 * Pages one server-action call may send. Each page is one Resend request, so
 * a call stays a few seconds long — far below the function timeout — and the
 * admin's progress bar moves often.
 */
export const INVITATION_MAX_PAGES_PER_CALL = 3;

// Deliberately loose: it only has to keep out what Resend would reject and,
// because a batch is atomic, take ninety-nine good addresses down with it.
const DELIVERABLE_EMAIL =
  /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]+$/;

export function isDeliverableEmail(email: string | null | undefined) {
  if (!email) return false;
  return DELIVERABLE_EMAIL.test(email.trim());
}

/**
 * Splits a page of recipients into those that can be mailed and a count of
 * those that cannot, dropping repeats of an address already on the page.
 * Visitors are unique by email, but not case-insensitively, and nobody should
 * get two copies of the same invitation.
 */
export function partitionRecipients<T extends { email: string }>(rows: T[]) {
  const seen = new Set<string>();
  const valid: T[] = [];
  let skipped = 0;

  for (const row of rows) {
    const normalized = row.email.trim().toLowerCase();
    if (!isDeliverableEmail(normalized) || seen.has(normalized)) {
      skipped += 1;
      continue;
    }
    seen.add(normalized);
    valid.push({ ...row, email: row.email.trim() });
  }

  return { valid, skipped };
}

/**
 * Names one attempt at one page of one send run. The page is named by its
 * bounds, not by who it held, so a retry keeps its key even when a recipient
 * registered in between. Retrying after an unknown outcome (our timeout)
 * reuses the attempt, and Resend delivers it at most once; retrying after
 * Resend refused the page, so nothing went out, moves to the next attempt.
 * A new run gets new keys, so sending again on purpose is not swallowed.
 */
export function invitationIdempotencyKey(input: {
  kind: InvitationKind;
  festivalId: number;
  runId: string;
  cursor: number;
  throughId: number;
  attempt: number;
}) {
  return `festival-invitation/${input.kind}/${input.festivalId}/${input.runId}/${input.cursor}-${input.throughId}/${input.attempt}`;
}

// Resend errors after which the batch may or may not have been accepted.
const UNKNOWN_OUTCOME_ERRORS = new Set([
  "application_error",
  "internal_server_error",
  "concurrent_idempotent_requests",
]);

/**
 * What a Resend batch response means for the page:
 * - `sent`: accepted. Includes `invalid_idempotent_request`, which says this
 *   key already went out with a different body — the first attempt was
 *   delivered and only its recipients have changed since.
 * - `unknown`: it may have gone out; retry with the same key.
 * - `refused`: it did not go out; retry with a new key.
 */
export function resendOutcome(
  error: { name?: string | null } | null | undefined,
): "sent" | "unknown" | "refused" {
  if (!error) return "sent";
  if (error.name === "invalid_idempotent_request") return "sent";
  if (error.name && UNKNOWN_OUTCOME_ERRORS.has(error.name)) return "unknown";
  return "refused";
}

const GREETING_NAME = /^\p{L}[\p{L}\p{M}' -]{0,39}$/u;

/**
 * A visitor's first name, fit to greet them with in a mail from our domain,
 * or null. Visitors register through a public form with no checks on the
 * name, so anything that is not plainly a name (a link, a sentence, markup)
 * is left out rather than sent to someone else's inbox under our name. No
 * dots either: "visita evil.com" is short and lettered, and mail clients
 * turn it into a link.
 */
export function safeGreetingName(name: string | null | undefined) {
  const trimmed = name?.trim().replace(/\s+/g, " ");
  if (!trimmed || !GREETING_NAME.test(trimmed)) return null;
  return trimmed;
}
