import "server-only";

import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import type { CreateBatchOptions, CreateEmailOptions } from "resend";

import {
  DIRECT_EMAIL_KEY_PREFIX,
  type DirectEmailTemplate,
} from "@/app/lib/notifications/admin-log-definitions";
import {
  sendBatchEmails,
  sendEmail,
  type SendBatchOptions,
  type SendBatchResult,
  type SendEmailOptions,
  type SendEmailResult,
} from "@/app/vendors/resend";
import { sendFailureType } from "@/app/vendors/resend-result";
import { db } from "@/db";
import { notificationDeliveries } from "@/db/schema";
import { isImpersonationReadOnlyError } from "@/db/write-guard";

/**
 * Emails sent straight to Resend, outside the delivery queue, still leave a
 * row in `notification_deliveries` so the admin log lists them: recipient,
 * template, status, error type and Resend's id.
 *
 * A thin layer, not the queue: the email is sent exactly as before (same
 * payload, options, timing and caller-side retries) and the row is written
 * once the answer is in, already settled. Nothing drains it: the queue's
 * drains only take `pending` rows and expired leases, and these are never
 * either, so no row here can cause a second send.
 *
 * Recording never changes the caller's outcome: a failed insert is logged
 * and swallowed, and the send's own result or throw is passed through as is.
 *
 * The stored payload is a snapshot of what identifies the email (subject,
 * sender, how many attachments), never its body: bodies carry ticket links,
 * tracking tokens and account links that must not sit in a table every
 * admin page can read.
 */

export { DIRECT_EMAIL_KEY_PREFIX };

export type RecordedEmailOptions = SendEmailOptions & {
  /** What the email is, for the admin log. */
  template: DirectEmailTemplate;
  /** The account the email is about, when there is one. */
  userId?: number | null;
};

type Snapshot = {
  subject: string | null;
  from: string | null;
  attachments: number;
};

const SUBJECT_MAX_LENGTH = 300;

function snapshotOf(payload: CreateEmailOptions): Snapshot {
  return {
    subject:
      typeof payload.subject === "string"
        ? payload.subject.slice(0, SUBJECT_MAX_LENGTH)
        : null,
    from: typeof payload.from === "string" ? payload.from : null,
    attachments: Array.isArray(payload.attachments)
      ? payload.attachments.length
      : 0,
  };
}

/** Every `to` address, as one text: one Resend email is one row. */
export function recipientsOf(to: CreateEmailOptions["to"]): string | null {
  const list = (Array.isArray(to) ? to : [to])
    .filter((address): address is string => typeof address === "string")
    .map((address) => address.trim())
    .filter(Boolean);
  return list.length > 0 ? list.join(", ") : null;
}

/**
 * Why a send that threw failed, as a type: a provider message can echo the
 * recipient. Our own ten-second timeout is the common case and gets a name.
 */
export function thrownSendError(error: unknown): string {
  if (error instanceof Error && /timed out/i.test(error.message)) {
    return "timeout";
  }
  return sendFailureType(error).slice(0, 180);
}

type Outcome = {
  status: "sent" | "failed";
  lastError: string | null;
  providerMessageId: string | null;
};

/**
 * Reads a single send's answer. A 409 for a key already used with another
 * body counts as accepted, as `getSendError` reads it; the development no-op
 * answers with neither data nor error and is recorded as `simulated`, as the
 * bulk lane records its own.
 */
export function singleOutcome(result: SendEmailResult): Outcome {
  if (result.error && result.error.name !== "invalid_idempotent_request") {
    return {
      status: "failed",
      lastError: `resend:${result.error.name}`,
      providerMessageId: null,
    };
  }
  const id = result.data?.id ?? null;
  return {
    status: "sent",
    lastError: result.error ? "idempotent_replay" : id ? null : "simulated",
    providerMessageId: id,
  };
}

type RowInput = {
  template: DirectEmailTemplate;
  userId: number | null;
  recipient: string | null;
  snapshot: Snapshot;
  lane: "transactional" | "bulk";
  idempotencyKey: string;
  outcome: Outcome;
};

/**
 * Writes or settles the rows. A caller that retries under its own Resend key
 * (the order reminders, the invitation pages) settles the same row again
 * instead of adding one: one more attempt, and a row already `sent` stays
 * sent with its id.
 */
async function writeRows(rows: RowInput[]) {
  const values = rows
    .filter((row) => row.recipient !== null)
    .map((row) => ({
      templateKey: row.template,
      userId: row.userId,
      channel: "email" as const,
      lane: row.lane,
      recipientEmail: row.recipient,
      payload: row.snapshot,
      status: row.outcome.status,
      attempts: 1,
      lastError: row.outcome.lastError,
      providerMessageId: row.outcome.providerMessageId,
      idempotencyKey: row.idempotencyKey,
      sentAt: row.outcome.status === "sent" ? sql`now()` : null,
    }));
  if (values.length === 0) return;

  const existing = notificationDeliveries;
  const keepSent = sql`${existing.status} = 'sent'`;
  await db
    .insert(notificationDeliveries)
    .values(values)
    .onConflictDoUpdate({
      target: notificationDeliveries.idempotencyKey,
      set: {
        attempts: sql`${existing.attempts} + 1`,
        status: sql`case when ${keepSent} then ${existing.status} else excluded.status end`,
        lastError: sql`case when ${keepSent} then ${existing.lastError} else excluded.last_error end`,
        providerMessageId: sql`coalesce(${existing.providerMessageId}, excluded.provider_message_id)`,
        sentAt: sql`coalesce(${existing.sentAt}, excluded.sent_at)`,
        updatedAt: sql`now()`,
      },
      // Only a recorded row: a queued row's key never starts this way, so
      // this can only ever touch rows this module wrote.
      setWhere: sql`${existing.idempotencyKey} LIKE ${`${DIRECT_EMAIL_KEY_PREFIX}%`}`,
    });
}

async function record(rows: RowInput[]) {
  try {
    await writeRows(rows);
  } catch (error) {
    // The email is out (or not) either way; only the log entry is missing.
    console.error("Could not record a sent email", {
      template: rows[0]?.template,
      errorType: error instanceof Error ? error.name : typeof error,
    });
  }
}

function rowKey(callerKey: string | undefined, suffix = "") {
  return callerKey
    ? `${DIRECT_EMAIL_KEY_PREFIX}${callerKey}${suffix}`
    : `${DIRECT_EMAIL_KEY_PREFIX}${randomUUID()}${suffix}`;
}

/**
 * `sendEmail`, recorded. Same arguments plus `template` (and `userId` when
 * the email is about an account), same result and same throws.
 *
 * A send refused during "Entrar como participante" leaves no row: nothing
 * was sent, and the view may write nothing.
 */
export async function sendRecordedEmail(
  payload: CreateEmailOptions,
  options: RecordedEmailOptions,
): Promise<SendEmailResult> {
  const { template, userId = null, ...sendOptions } = options;
  const base = {
    template,
    userId,
    recipient: recipientsOf(payload.to),
    snapshot: snapshotOf(payload),
    lane: "transactional" as const,
    idempotencyKey: rowKey(sendOptions.idempotencyKey),
  };

  let result: SendEmailResult;
  try {
    result = await sendEmail(payload, sendOptions);
  } catch (error) {
    if (!isImpersonationReadOnlyError(error)) {
      await record([
        {
          ...base,
          outcome: {
            status: "failed",
            lastError: thrownSendError(error),
            providerMessageId: null,
          },
        },
      ]);
    }
    throw error;
  }

  await record([{ ...base, outcome: singleOutcome(result) }]);
  return result;
}

/**
 * Reads a batch's answer, email by email. The development no-op answers
 * `not-sent` ids, which are no Resend id.
 */
export function batchOutcomes(
  result: {
    data: unknown;
    error: { name: string } | null;
  },
  count: number,
): Outcome[] {
  const simulated = "simulated" in result;
  const error =
    result.error && result.error.name !== "invalid_idempotent_request"
      ? result.error
      : null;
  const data = result.data as {
    data?: { id?: string }[];
    errors?: { index: number }[];
  } | null;
  const refused = new Set((data?.errors ?? []).map((entry) => entry.index));

  return Array.from({ length: count }, (_, index): Outcome => {
    if (error) {
      return {
        status: "failed",
        lastError: `resend:${error.name}`,
        providerMessageId: null,
      };
    }
    if (refused.has(index)) {
      return {
        status: "failed",
        lastError: "resend:item_rejected",
        providerMessageId: null,
      };
    }
    const id = simulated ? null : (data?.data?.[index]?.id ?? null);
    return {
      status: "sent",
      lastError: simulated
        ? "simulated"
        : result.error
          ? "idempotent_replay"
          : null,
      providerMessageId: id,
    };
  });
}

/**
 * `sendBatchEmails`, recorded: one row per email in the batch, on the bulk
 * lane, each with its own Resend id. `userIds` follows `emails` by index.
 */
export async function sendRecordedBatch<
  Options extends SendBatchOptions = SendBatchOptions,
>(
  emails: CreateBatchOptions,
  options: Options & {
    template: DirectEmailTemplate;
    userIds?: readonly (number | null)[];
  },
): Promise<SendBatchResult<Options>> {
  const { template, userIds, ...batchOptions } = options;
  const rowsFor = (outcomes: Outcome[]): RowInput[] =>
    emails.map((email, index) => ({
      template,
      userId: userIds?.[index] ?? null,
      recipient: recipientsOf(email.to),
      snapshot: snapshotOf(email),
      lane: "bulk",
      // A retry of the same batch under the same key settles the same rows.
      idempotencyKey: rowKey(batchOptions.idempotencyKey, `:${index}`),
      outcome: outcomes[index]!,
    }));

  let result: SendBatchResult<Options>;
  try {
    result = await sendBatchEmails(emails, batchOptions as unknown as Options);
  } catch (error) {
    if (!isImpersonationReadOnlyError(error)) {
      const failure: Outcome = {
        status: "failed",
        lastError: thrownSendError(error),
        providerMessageId: null,
      };
      await record(rowsFor(emails.map(() => failure)));
    }
    throw error;
  }

  await record(rowsFor(batchOutcomes(result, emails.length)));
  return result;
}
