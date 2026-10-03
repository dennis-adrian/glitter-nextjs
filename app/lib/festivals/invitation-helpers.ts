import "server-only";

import { createHash } from "node:crypto";

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
 * Names one page of one send run. Retrying the same page within a run reuses
 * the key, so Resend delivers it once even when our side timed out after
 * Resend had already accepted it. A new run gets new keys, so sending again
 * on purpose is not silently swallowed.
 */
export function invitationIdempotencyKey(input: {
  kind: InvitationKind;
  festivalId: number;
  runId: string;
  recipientIds: readonly number[];
}) {
  const digest = createHash("sha256")
    .update(input.recipientIds.join(","))
    .digest("hex")
    .slice(0, 24);
  return `festival-invitation/${input.kind}/${input.festivalId}/${input.runId}/${digest}`;
}
