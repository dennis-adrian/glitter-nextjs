import "server-only";

import { randomUUID } from "crypto";
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
  TransactionRollbackError,
} from "drizzle-orm";
import type { CreateBatchEmailOptions } from "resend";

import { comunicadoBatchRenderer } from "@/app/lib/comunicados/delivery";
import { isDeliverableEmail } from "@/app/lib/festivals/invitation-helpers";
import { sendBatchEmails } from "@/app/vendors/resend";
import { retryAfterMs } from "@/app/vendors/resend-result";
import { db } from "@/db";
import { notificationDeliveries, notifications } from "@/db/schema";

/**
 * The bulk email lane (D3 of docs/PRD-in-app-notifications.md's phase 3
 * design): comunicado email, sent in batches of up to 100 under one Resend
 * idempotency key each, one request at a time across every server, paced
 * well under Resend's rate limit so transactional email keeps its share.
 *
 * A batch is one campaign's rows of one template, claimed and keyed in a
 * committed transaction before any request carries the key
 * (`{templateKey}-batch:{campaignId}:{uuid}`; `sendBatchEmails` scopes it by
 * environment). The key stays with those rows: a batch that may have reached
 * Resend (`maybe_sent_at`) is only ever re-sent whole, minus the rows its
 * pre-check drops, under the same key, so Resend deduplicates it. A key is
 * dropped only after a definite refusal of rows nothing may have reached, and
 * no row is claimed 20 hours after it was written, inside Resend's 24-hour
 * memory of a key.
 *
 * The lane knows nothing about what it sends: a renderer per template key
 * locks, checks and renders the content, and says which campaigns a lane-wide
 * run may take.
 */

const nd = notificationDeliveries;

export type BulkEmailTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A row as its claim returned it: `processing`, leased, keyed. */
export type ClaimedBulkRow = typeof notificationDeliveries.$inferSelect;

export type BulkEmailPreparation = {
  /** Not sent and never will be, with the reason (`unsubscribed`, `retracted`…). */
  skipped: { id: number; code: string }[];
  /** Not sent, as a failure an admin can see (`address_changed`…). */
  failed: { id: number; code: string }[];
  /** To send, with the content revision the email carries, or null. */
  emails: {
    id: number;
    email: CreateBatchEmailOptions;
    revision: number | null;
  }[];
};

export interface BulkEmailRenderer {
  /**
   * Which campaigns a lane-wide run may claim (comunicados: this
   * environment's). ANDed into the claim, where the delivery's inbox item is
   * joined as `notifications`, under its own name: write it with the schema's
   * `notifications` columns, as `sendBulkPushes` takes its scope. A run for
   * one campaign uses that campaign instead.
   */
  scope(): SQL;
  /**
   * Inside the send transaction, before the lane lock: locks whatever fixes
   * the content, so an edit or a retraction waits for the batch, or the batch
   * for it. Runs right after `SET LOCAL lock_timeout`, so it may throw
   * `lock_not_available` (55P03); the claim is then handed back untried.
   */
  lockContent(tx: BulkEmailTx, campaignId: number): Promise<void>;
  /**
   * Checks and renders the claimed rows in the same transaction. Every
   * claimed row must come back exactly once, in one of the three lists; a
   * renderer that throws, or misses or repeats a row, costs the batch an
   * attempt.
   */
  prepare(
    tx: BulkEmailTx,
    campaignId: number,
    rows: readonly ClaimedBulkRow[],
  ): Promise<BulkEmailPreparation>;
}

export type BulkEmailRenderers = Readonly<Record<string, BulkEmailRenderer>>;

/**
 * Renderers by `notification_deliveries.template_key`. A bulk email whose
 * template has none is never claimed, and expires after 20 hours. The key is
 * also the batch key's prefix: `comunicado-batch:{campaignId}:{uuid}`.
 * `delivery.ts` imports only this file's types, so there is no cycle.
 */
export const BULK_EMAIL_RENDERERS: BulkEmailRenderers = {
  comunicado: comunicadoBatchRenderer,
};

/**
 * First key of the lane's advisory lock. Distinct from tickets (4711),
 * festival terms (5822) and reservation participants (6933).
 */
export const BULK_LANE_LOCK_NAMESPACE = 7044;

/** No batch starts with less than this left before the deadline. */
export const BULK_BATCH_RESERVE_MS = 25_000;
/**
 * The wait after each request, still holding the lane lock, so any two bulk
 * requests are at least this far apart whatever the number of servers.
 */
export const BULK_BATCH_SPACING_MS = 1_500;

export type BulkTiming = {
  reserveMs: number;
  spacingMs: number;
  /** The wait before trying a busy lane lock again. */
  lockPollMs: number;
  /** Bounds of the content lock's `lock_timeout`; never 0, which disables it. */
  minLockTimeoutMs: number;
  maxLockTimeoutMs: number;
  /** The longest a throttled run waits before its next batch. */
  maxThrottleWaitMs: number;
};

export const BULK_TIMING: BulkTiming = {
  reserveMs: BULK_BATCH_RESERVE_MS,
  spacingMs: BULK_BATCH_SPACING_MS,
  lockPollMs: 500,
  minLockTimeoutMs: 1_000,
  maxLockTimeoutMs: 15_000,
  maxThrottleWaitMs: 5_000,
};

/** One Resend batch request: Resend's own ceiling (`RESEND_BATCH_MAX_EMAILS`). */
const BULK_BATCH_SIZE = 100;
const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 5 * 60;
const MAX_UNKNOWN_BACKOFF_MS = 15 * 60 * 1000;
const QUOTA_HOLD_SECONDS = 60 * 60;
const CONFIG_HOLD_SECONDS = 15 * 60;
const MIN_THROTTLE_SECONDS = 2;
const MAX_THROTTLE_SECONDS = 24 * 60 * 60;
const MAX_THROTTLES_PER_RUN = 3;
/** A database error before the request is retried once in a run. */
const MAX_TRANSIENT_RELEASES_PER_RUN = 2;
const MAX_ERROR_LENGTH = 180;
/**
 * The longest a claim waits for the lane, whatever the deadline: well inside
 * its lease, so no other server re-claims rows this one may still send.
 */
const MAX_CLAIM_WAIT_MS = 2 * 60 * 1000;
const EXPIRY = sql.raw("interval '20 hours'");

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

/** Whether a batch may still start: `deadline − now ≥ reserve`. */
export function hasBatchTime(deadline: number, now: number, reserveMs: number) {
  return deadline - now >= reserveMs;
}

/**
 * The content lock's wait, `max(min, min(max, deadline − now − reserve))`: a
 * batch that waits behind an edit still ends before the deadline.
 */
export function contentLockTimeoutMs(
  deadline: number,
  now: number,
  timing: Pick<
    BulkTiming,
    "reserveMs" | "minLockTimeoutMs" | "maxLockTimeoutMs"
  >,
) {
  const bounded = Math.max(
    timing.minLockTimeoutMs,
    Math.min(timing.maxLockTimeoutMs, deadline - now - timing.reserveMs),
  );
  return Math.max(1, Math.round(bounded));
}

/** `min(15 min, 30 s · 2^(n−1))` after the n-th spent attempt, in seconds. */
export function unknownBackoffSeconds(attempts: number) {
  return (
    Math.min(MAX_UNKNOWN_BACKOFF_MS, 30_000 * 2 ** Math.max(0, attempts - 1)) /
    1000
  );
}

/** How long throttled rows wait: Retry-After, at least 2 s, at most a day. */
export function throttleDelaySeconds(retryAfter: number | null) {
  return Math.min(
    MAX_THROTTLE_SECONDS,
    Math.max(MIN_THROTTLE_SECONDS, Math.ceil((retryAfter ?? 0) / 1000)),
  );
}

/** How long a throttled run waits before its next batch. */
export function throttleWaitMs(retryAfter: number | null, maxWaitMs: number) {
  return Math.min(
    maxWaitMs,
    Math.max(MIN_THROTTLE_SECONDS * 1000, retryAfter ?? 0),
  );
}

const UNKNOWN_CODES = new Set([
  "application_error",
  "internal_server_error",
  "concurrent_idempotent_requests",
]);
const QUOTA_CODES = new Set(["daily_quota_exceeded", "monthly_quota_exceeded"]);
const CONFIG_CODES = new Set([
  "invalid_api_key",
  "missing_api_key",
  "restricted_api_key",
  "invalid_from_address",
  "security_error",
]);

/** What a batch request's answer means for its rows (D3's outcome table). */
export type BulkBatchOutcome =
  | {
      kind: "accepted";
      simulated: boolean;
      /** By payload index; null for a refused item, or when ids cannot be matched. */
      providerIds: (string | null)[];
      /** By payload index: refused on its own in a permissive batch. */
      rejected: boolean[];
      /** The answer's counts do not add up to the payload: ids are not trusted. */
      mismatch: boolean;
    }
  /** 409: an earlier request under this key was accepted. */
  | { kind: "replay" }
  /** It may have gone out: retry under the same key. */
  | { kind: "unknown"; error: string; statusCode: number | null }
  | { kind: "throttled"; retryAfterMs: number | null }
  | { kind: "quota"; error: string; statusCode: number | null }
  | { kind: "config"; error: string; statusCode: number | null }
  /** Nothing went out. */
  | { kind: "refused"; error: string; statusCode: number | null };

/** The parts of `sendBatchEmails`'s result this lane reads. */
export type BulkBatchResponse = {
  data?: {
    data?: readonly { id?: unknown }[] | null;
    errors?: readonly { index?: unknown }[] | null;
  } | null;
  error?: { name?: string | null; statusCode?: number | null } | null;
  headers?: Record<string, string> | null;
  simulated?: boolean;
};

/**
 * Matches a permissive answer to the payload: `data[i]` belongs to the i-th
 * payload index that `errors` does not list. When the counts do not add up,
 * or an index is out of range or repeated, no id is trusted.
 */
export function mapPermissiveBatch(
  size: number,
  data: readonly { id?: unknown }[],
  errors: readonly { index?: unknown }[],
) {
  const rejected = Array.from({ length: size }, () => false);
  let readable = true;
  for (const error of errors) {
    const index = error.index;
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= size ||
      rejected[index]
    ) {
      readable = false;
      continue;
    }
    rejected[index] = true;
  }
  const mismatch = !readable || data.length + errors.length !== size;
  const providerIds: (string | null)[] = Array.from(
    { length: size },
    () => null,
  );
  if (!mismatch) {
    let next = 0;
    for (let index = 0; index < size; index += 1) {
      if (rejected[index]) continue;
      const id = data[next++]?.id;
      providerIds[index] = typeof id === "string" && id ? id : null;
    }
  }
  return { providerIds, rejected, mismatch };
}

/**
 * Reads a batch answer, or null when the request threw (our ten-second
 * timeout: it may have landed).
 */
export function bulkBatchOutcome(
  response: BulkBatchResponse | null,
  size: number,
): BulkBatchOutcome {
  if (!response) return { kind: "unknown", error: "timeout", statusCode: null };

  const { error } = response;
  if (error) {
    const name = error.name || "unknown";
    const statusCode = error.statusCode ?? null;
    const code = `resend:${name}`.slice(0, MAX_ERROR_LENGTH);
    if (name === "invalid_idempotent_request") return { kind: "replay" };
    // Only a named refusal proves nothing went out. An answer without a name
    // (the SDK passes any JSON error body through, with no status) or a
    // server error it does not list may have come after Resend accepted it.
    const unidentified = !error.name;
    const serverSide =
      statusCode != null &&
      statusCode >= 500 &&
      !QUOTA_CODES.has(name) &&
      !CONFIG_CODES.has(name);
    if (UNKNOWN_CODES.has(name) || unidentified || serverSide)
      return { kind: "unknown", error: code, statusCode };
    if (name === "rate_limit_exceeded") {
      return {
        kind: "throttled",
        retryAfterMs: retryAfterMs(response.headers),
      };
    }
    if (QUOTA_CODES.has(name))
      return { kind: "quota", error: code, statusCode };
    if (CONFIG_CODES.has(name))
      return { kind: "config", error: code, statusCode };
    return { kind: "refused", error: code, statusCode };
  }

  // An answer with neither data nor an error says nothing about delivery.
  const ids = response.data?.data;
  if (!Array.isArray(ids)) {
    return {
      kind: "unknown",
      error: "resend:empty_response",
      statusCode: null,
    };
  }
  return {
    kind: "accepted",
    simulated: response.simulated === true,
    ...mapPermissiveBatch(size, ids, response.data?.errors ?? []),
  };
}

/** What one row's settle writes. Times are added to the database's `now()`. */
export type RowSettlement = {
  id: number;
  status: "pending" | "sent" | "failed" | "skipped";
  lastError: string | null;
  attempts: number;
  providerMessageId: string | null;
  contentRevision: number | null;
  /** Seconds from now to `next_attempt_at`; null leaves it. */
  delaySeconds: number | null;
  maybeSent: "keep" | "mark" | "clear";
  /** `drop` is written only while nothing under the key may have landed. */
  batchKey: "keep" | "drop";
  sentAt: boolean;
};

export type BulkRowState = Pick<
  ClaimedBulkRow,
  "id" | "attempts" | "maybeSentAt" | "lastError"
>;

function dropKeyUnlessMaybeSent(row: BulkRowState): "keep" | "drop" {
  return row.maybeSentAt == null ? "drop" : "keep";
}

function unchanged(
  row: BulkRowState,
  values: Partial<RowSettlement> & Pick<RowSettlement, "status" | "lastError">,
): RowSettlement {
  return {
    id: row.id,
    attempts: row.attempts,
    providerMessageId: null,
    contentRevision: null,
    delaySeconds: null,
    maybeSent: "keep",
    batchKey: "keep",
    sentAt: false,
    ...values,
  };
}

/** A row its pre-check or the address check settled before any request. */
export function precheckSettlement(
  row: BulkRowState,
  status: "skipped" | "failed",
  code: string,
): RowSettlement {
  return unchanged(row, {
    status,
    lastError: code.slice(0, MAX_ERROR_LENGTH) || "unknown",
  });
}

/** A claim handed back untried: nothing is marked or spent. */
export function releaseSettlement(row: BulkRowState): RowSettlement {
  return unchanged(row, {
    status: "pending",
    lastError: row.lastError,
    delaySeconds: 0,
  });
}

/**
 * The renderer or pre-check threw: an attempt is spent with the backoff, so
 * every other due batch goes first.
 */
export function renderFailureSettlement(row: BulkRowState): RowSettlement {
  const attempts = row.attempts + 1;
  const done = attempts >= MAX_ATTEMPTS;
  return unchanged(row, {
    status: done ? "failed" : "pending",
    lastError:
      done && row.maybeSentAt != null ? "outcome_unknown" : "render_failed",
    attempts,
    delaySeconds: done ? null : unknownBackoffSeconds(attempts),
    batchKey: dropKeyUnlessMaybeSent(row),
  });
}

/** A row that went in the request, at payload `index`. */
export function requestSettlement(
  outcome: BulkBatchOutcome,
  row: BulkRowState,
  revision: number | null,
  index: number,
): RowSettlement {
  switch (outcome.kind) {
    case "accepted":
      // An answer whose ids and errors do not line up with the payload says
      // neither which rows went nor which were refused: every row may have
      // arrived, none is proven sent. It keeps its key and is never retried
      // by hand, as an unknown outcome that ran out of attempts.
      if (outcome.mismatch && !outcome.simulated) {
        return unchanged(row, {
          status: "failed",
          lastError: "outcome_unknown",
          maybeSent: "mark",
        });
      }
      // A 200 under this key that refuses an item proves that item was not
      // delivered, whatever an earlier attempt did.
      if (outcome.rejected[index]) {
        return unchanged(row, {
          status: "failed",
          lastError: "resend:item_rejected",
          maybeSent: "clear",
        });
      }
      return unchanged(row, {
        status: "sent",
        lastError: outcome.simulated ? "simulated" : null,
        providerMessageId: outcome.simulated
          ? null
          : (outcome.providerIds[index] ?? null),
        contentRevision: revision,
        sentAt: true,
      });
    case "replay":
      // Which revision that earlier request carried is not known.
      return unchanged(row, {
        status: "sent",
        lastError: "idempotent_replay",
        sentAt: true,
      });
    case "unknown": {
      const attempts = row.attempts + 1;
      const done = attempts >= MAX_ATTEMPTS;
      return unchanged(row, {
        status: done ? "failed" : "pending",
        lastError: done ? "outcome_unknown" : outcome.error,
        attempts,
        delaySeconds: done ? null : unknownBackoffSeconds(attempts),
        maybeSent: "mark",
      });
    }
    case "throttled":
      return unchanged(row, {
        status: "pending",
        lastError: "resend:rate_limit_exceeded",
        delaySeconds: throttleDelaySeconds(outcome.retryAfterMs),
        batchKey: dropKeyUnlessMaybeSent(row),
      });
    case "quota":
      // Never retried on its own: the allowance renews in a day or a month,
      // and "Reintentar fallidos" sends them then. A row that may have landed
      // waits instead, until it lands or expires.
      return row.maybeSentAt == null
        ? unchanged(row, {
            status: "failed",
            lastError: outcome.error,
            batchKey: "drop",
          })
        : unchanged(row, {
            status: "pending",
            lastError: outcome.error,
            delaySeconds: QUOTA_HOLD_SECONDS,
          });
    case "config":
      return unchanged(row, {
        status: "pending",
        lastError: outcome.error,
        delaySeconds: CONFIG_HOLD_SECONDS,
        batchKey: dropKeyUnlessMaybeSent(row),
      });
    case "refused": {
      const attempts = row.attempts + 1;
      const done = attempts >= MAX_ATTEMPTS;
      return unchanged(row, {
        status: done ? "failed" : "pending",
        lastError: outcome.error,
        attempts,
        delaySeconds: done ? null : unknownBackoffSeconds(attempts),
        batchKey: dropKeyUnlessMaybeSent(row),
      });
    }
  }
}

const TRANSIENT_SQLSTATES = new Set([
  "40P01", // deadlock_detected
  "40001", // serialization_failure
  "55P03", // lock_not_available, which lock_timeout raises
  "57014", // query_canceled
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
]);
const CONNECTION_ERRNOS = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
]);
// pg's own, which carry no code.
const CONNECTION_MESSAGE =
  /^(Connection terminated|Client has encountered a connection error|timeout exceeded when trying to connect)/;

function* errorChain(error: unknown) {
  for (
    let current: unknown = error, depth = 0;
    current && typeof current === "object" && depth < 8;
    current = (current as { cause?: unknown }).cause, depth += 1
  ) {
    yield current as { code?: unknown; message?: unknown };
  }
}

/** The first SQLSTATE or errno in an error's cause chain, for a log line. */
export function errorCode(error: unknown): string | null {
  for (const link of errorChain(error)) {
    if (typeof link.code === "string") return link.code;
  }
  return null;
}

/**
 * A database error worth one more try that says nothing about the batch:
 * D2's transient SQLSTATEs and lost connections.
 */
export function isTransientDbError(error: unknown) {
  for (const link of errorChain(error)) {
    const code = link.code;
    if (typeof code === "string") {
      if (TRANSIENT_SQLSTATES.has(code) || code.startsWith("08")) return true;
      if (CONNECTION_ERRNOS.has(code)) return true;
    }
    if (
      typeof link.message === "string" &&
      CONNECTION_MESSAGE.test(link.message)
    ) {
      return true;
    }
  }
  return false;
}

function isLockNotAvailable(error: unknown) {
  for (const link of errorChain(error)) {
    if (link.code === "55P03") return true;
  }
  return false;
}

/** Type and SQLSTATE only: a query error's message carries its params. */
function errorShape(error: unknown) {
  return {
    errorType: error instanceof Error ? error.name : typeof error,
    code: errorCode(error),
  };
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

const bulkEmail = and(eq(nd.lane, "bulk"), eq(nd.channel, "email"));

/** As in `deliveries.ts`: due by the database's clock. */
const dueNow = sql`(
  ${nd.status} = 'pending'
  OR (
    ${nd.status} = 'processing'
    AND ${nd.leaseExpiresAt} IS NOT NULL
    AND ${nd.leaseExpiresAt} < now()
  )
) AND ${nd.nextAttemptAt} <= now()`;

const notExpired = sql`${nd.createdAt} > now() - ${EXPIRY}`;

/**
 * Not settled, and nobody holds it. A held batch is re-claimed whole on this,
 * not on each row being due: rows of one key can carry different backoffs
 * (their attempt counts differ), and taking only the due ones would send a
 * part of the batch under the key, after which the rest would come back as a
 * 409 and be recorded sent without any request carrying them.
 */
const unsettled = sql`(
  ${nd.status} = 'pending'
  OR (
    ${nd.status} = 'processing'
    AND ${nd.leaseExpiresAt} IS NOT NULL
    AND ${nd.leaseExpiresAt} < now()
  )
)`;

/** Rows no attempt may have reached, free to take a new key. */
const freshPool = and(bulkEmail, isNull(nd.batchKey), dueNow, notExpired);

/**
 * Step 0: no bulk email is ever sent 20 hours after its row was written, so
 * no key is re-submitted once Resend may have forgotten it. A row found
 * `processing` had an attempt that never settled: it is marked as one that
 * may have landed, as a claim would mark it, rather than read as "never
 * sent" and retried by hand.
 */
export async function expireBulkEmails(): Promise<number> {
  const expired = await db
    .update(nd)
    .set({
      status: "failed",
      lastError: sql`CASE WHEN ${nd.status} = 'pending' AND ${nd.maybeSentAt} IS NULL THEN 'expired' ELSE 'outcome_unknown' END`,
      // The key test keeps a stray keyless row from failing the whole step
      // on the maybe-sent CHECK; this lane keys every row it takes.
      maybeSentAt: sql`CASE WHEN ${nd.status} = 'processing' AND ${nd.batchKey} IS NOT NULL THEN coalesce(${nd.maybeSentAt}, now()) ELSE ${nd.maybeSentAt} END`,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        bulkEmail,
        sql`(${nd.status} = 'pending' OR (${nd.status} = 'processing' AND ${nd.leaseExpiresAt} < now()))`,
        sql`${nd.createdAt} <= now() - ${EXPIRY}`,
      ),
    )
    .returning({ id: nd.id });
  return expired.length;
}

type BulkClaim = {
  owner: string;
  campaignId: number;
  templateKey: string;
  batchKey: string;
  rows: ClaimedBulkRow[];
};

function claimScope(renderers: BulkEmailRenderers, campaignId?: number) {
  const keys = Object.keys(renderers);
  if (campaignId !== undefined) {
    return and(
      inArray(nd.templateKey, keys),
      eq(notifications.campaignId, campaignId),
    );
  }
  return or(
    ...keys.map((key) => and(eq(nd.templateKey, key), renderers[key]!.scope())),
  );
}

const leaseUntil = sql`now() + make_interval(secs => ${LEASE_SECONDS})`;

/**
 * A held batch: rows that kept a key and are due again, re-claimed whole
 * under it. Rows found `processing` had an attempt that never settled, so
 * they are marked as possibly sent. Locked in id order, so two servers
 * reaching for the same batch queue instead of deadlocking.
 */
async function claimHeldBatch(
  tx: BulkEmailTx,
  owner: string,
  scope: SQL | undefined,
): Promise<BulkClaim | null> {
  const [first] = await tx
    .select({
      batchKey: nd.batchKey,
      campaignId: notifications.campaignId,
      templateKey: nd.templateKey,
    })
    .from(nd)
    .innerJoin(notifications, eq(notifications.id, nd.notificationId))
    .where(
      and(
        bulkEmail,
        isNotNull(nd.batchKey),
        dueNow,
        notExpired,
        isNotNull(notifications.campaignId),
        scope,
      ),
    )
    .orderBy(nd.nextAttemptAt, nd.id)
    .limit(1);
  if (!first?.batchKey || first.campaignId == null) return null;

  const locked = await tx
    .select({ id: nd.id })
    .from(nd)
    .where(
      and(eq(nd.batchKey, first.batchKey), bulkEmail, unsettled, notExpired),
    )
    .orderBy(nd.id)
    .for("update");
  // Another server took it between the two statements.
  if (locked.length === 0) return null;

  const rows = await tx
    .update(nd)
    .set({
      status: "processing",
      leaseOwner: owner,
      leaseExpiresAt: leaseUntil,
      updatedAt: sql`now()`,
      maybeSentAt: sql`CASE WHEN ${nd.status} = 'processing' THEN coalesce(${nd.maybeSentAt}, now()) ELSE ${nd.maybeSentAt} END`,
    })
    .where(
      inArray(
        nd.id,
        locked.map((row) => row.id),
      ),
    )
    .returning();
  return {
    owner,
    campaignId: first.campaignId,
    templateKey: first.templateKey,
    batchKey: first.batchKey,
    rows: rows.sort((a, b) => a.id - b.id),
  };
}

/**
 * A fresh batch: the oldest due campaign's next rows, under a new key. Both
 * reads skip rows another claim holds, so a second server takes the next
 * rows, or the next campaign, instead of waiting.
 */
async function claimFreshBatch(
  tx: BulkEmailTx,
  owner: string,
  scope: SQL | undefined,
): Promise<BulkClaim | null> {
  const [first] = await tx
    .select({
      campaignId: notifications.campaignId,
      templateKey: nd.templateKey,
    })
    .from(nd)
    .innerJoin(notifications, eq(notifications.id, nd.notificationId))
    .where(and(freshPool, isNotNull(notifications.campaignId), scope))
    .orderBy(nd.id)
    .limit(1)
    .for("update", { of: nd, skipLocked: true });
  if (!first || first.campaignId == null) return null;

  const picked = await tx
    .select({ id: nd.id })
    .from(nd)
    .innerJoin(notifications, eq(notifications.id, nd.notificationId))
    .where(
      and(
        freshPool,
        eq(notifications.campaignId, first.campaignId),
        eq(nd.templateKey, first.templateKey),
        scope,
      ),
    )
    .orderBy(nd.id)
    .limit(BULK_BATCH_SIZE)
    .for("update", { of: nd, skipLocked: true });
  if (picked.length === 0) return null;

  const batchKey = `${first.templateKey}-batch:${first.campaignId}:${randomUUID()}`;
  const rows = await tx
    .update(nd)
    .set({
      status: "processing",
      leaseOwner: owner,
      leaseExpiresAt: leaseUntil,
      batchKey,
      updatedAt: sql`now()`,
    })
    .where(
      inArray(
        nd.id,
        picked.map((row) => row.id),
      ),
    )
    .returning();
  return {
    owner,
    campaignId: first.campaignId,
    templateKey: first.templateKey,
    batchKey,
    rows: rows.sort((a, b) => a.id - b.id),
  };
}

/** S1: a held batch first, else a fresh one; committed before any request. */
async function claimBulkBatch(
  renderers: BulkEmailRenderers,
  campaignId?: number,
): Promise<BulkClaim | null> {
  const scope = claimScope(renderers, campaignId);
  const owner = `bulk-email:${randomUUID()}`;
  return db.transaction(
    async (tx) =>
      (await claimHeldBatch(tx, owner, scope)) ??
      (await claimFreshBatch(tx, owner, scope)),
  );
}

type SettleCounts = {
  sent: number;
  skipped: number;
  failed: number;
  retry: number;
};

function emptyCounts(): SettleCounts {
  return { sent: 0, skipped: 0, failed: 0, retry: 0 };
}

/**
 * Settles rows in one statement, only while this claim still holds them.
 * `skipRetracted` is for rows going back to `pending` outside the content
 * lock: those whose inbox item was retracted in the meantime are skipped
 * instead, since the retraction only skips rows it finds pending.
 */
async function settleRows(
  tx: BulkEmailTx,
  owner: string,
  settlements: readonly RowSettlement[],
  { skipRetracted = false }: { skipRetracted?: boolean } = {},
): Promise<SettleCounts> {
  const counts = emptyCounts();
  if (settlements.length === 0) return counts;

  const values = sql.join(
    settlements.map(
      (s) =>
        sql`(${s.id}::integer, ${s.status}::text, ${s.lastError}::text, ${s.attempts}::integer, ${s.providerMessageId}::text, ${s.contentRevision}::integer, ${s.delaySeconds}::double precision, ${s.maybeSent}::text, ${s.batchKey}::text, ${s.sentAt}::boolean)`,
    ),
    sql`, `,
  );
  const settled = await tx.execute<{ id: number; status: string }>(sql`
    UPDATE ${nd} AS d SET
      status = v.status::notification_delivery_status,
      last_error = v.last_error,
      attempts = v.attempts,
      provider_message_id = v.provider_message_id,
      content_revision = v.content_revision,
      sent_at = CASE WHEN v.sent_at THEN now() ELSE d.sent_at END,
      next_attempt_at = CASE WHEN v.delay_seconds IS NULL THEN d.next_attempt_at
                             ELSE now() + make_interval(secs => v.delay_seconds) END,
      maybe_sent_at = CASE v.maybe_sent WHEN 'mark' THEN coalesce(d.maybe_sent_at, now())
                                        WHEN 'clear' THEN NULL
                                        ELSE d.maybe_sent_at END,
      batch_key = CASE WHEN v.batch_key = 'drop' AND d.maybe_sent_at IS NULL THEN NULL
                       ELSE d.batch_key END,
      lease_owner = NULL,
      lease_expires_at = NULL,
      updated_at = now()
    FROM (VALUES ${values}) AS v(id, status, last_error, attempts, provider_message_id,
                                 content_revision, delay_seconds, maybe_sent, batch_key, sent_at)
    WHERE d.id = v.id AND d.lease_owner = ${owner}
    RETURNING d.id, d.status`);

  const pendingIds: number[] = [];
  for (const row of settled.rows) {
    if (row.status === "pending") {
      counts.retry += 1;
      pendingIds.push(row.id);
    } else if (row.status === "sent") counts.sent += 1;
    else if (row.status === "skipped") counts.skipped += 1;
    else if (row.status === "failed") counts.failed += 1;
  }

  if (skipRetracted && pendingIds.length > 0) {
    const retracted = await tx
      .update(nd)
      .set({ status: "skipped", lastError: "retracted", updatedAt: sql`now()` })
      .where(
        and(
          inArray(nd.id, pendingIds),
          eq(nd.status, "pending"),
          sql`EXISTS (SELECT 1 FROM ${notifications} WHERE ${notifications.id} = ${nd.notificationId} AND ${notifications.retractedAt} IS NOT NULL)`,
        ),
      )
      .returning({ id: nd.id });
    counts.retry -= retracted.length;
    counts.skipped += retracted.length;
  }
  return counts;
}

/**
 * Quota: the campaign's emails no request has carried yet fail now rather
 * than each spending a request on the same refusal.
 */
async function failNeverBatched(
  tx: BulkEmailTx,
  claim: BulkClaim,
  error: string,
): Promise<number> {
  const failed = await tx
    .update(nd)
    .set({ status: "failed", lastError: error, updatedAt: sql`now()` })
    .where(
      and(
        bulkEmail,
        isNull(nd.batchKey),
        eq(nd.status, "pending"),
        eq(nd.templateKey, claim.templateKey),
        inArray(
          nd.notificationId,
          tx
            .select({ id: notifications.id })
            .from(notifications)
            .where(eq(notifications.campaignId, claim.campaignId)),
        ),
      ),
    )
    .returning({ id: nd.id });
  return failed.length;
}

function releaseClaim(claim: BulkClaim) {
  return db.transaction((tx) =>
    settleRows(tx, claim.owner, claim.rows.map(releaseSettlement), {
      skipRetracted: true,
    }),
  );
}

function spendClaim(claim: BulkClaim) {
  return db.transaction((tx) =>
    settleRows(tx, claim.owner, claim.rows.map(renderFailureSettlement), {
      skipRetracted: true,
    }),
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDeliverableTo(to: CreateBatchEmailOptions["to"]) {
  const addresses = Array.isArray(to) ? to : [to];
  return (
    addresses.length > 0 &&
    addresses.every((address) => isDeliverableEmail(address))
  );
}

type Sendable = {
  row: ClaimedBulkRow;
  email: CreateBatchEmailOptions;
  revision: number | null;
};

/**
 * The renderer's answer as settlements and the emails to send, in id order
 * so a retry under the same key sends the same payload. Throws unless every
 * claimed row comes back exactly once.
 */
function partitionPrepared(
  rows: readonly ClaimedBulkRow[],
  prepared: BulkEmailPreparation,
) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<number>();
  const take = (id: number) => {
    const row = byId.get(id);
    if (!row || seen.has(id)) {
      throw new Error("Bulk renderer returned a row it was not given");
    }
    seen.add(id);
    return row;
  };

  const settlements: RowSettlement[] = [];
  for (const { id, code } of prepared.skipped) {
    settlements.push(precheckSettlement(take(id), "skipped", code));
  }
  for (const { id, code } of prepared.failed) {
    settlements.push(precheckSettlement(take(id), "failed", code));
  }
  const sendable: Sendable[] = [];
  for (const { id, email, revision } of [...prepared.emails].sort(
    (a, b) => a.id - b.id,
  )) {
    const row = take(id);
    if (isDeliverableTo(email.to)) sendable.push({ row, email, revision });
    else
      settlements.push(precheckSettlement(row, "skipped", "invalid_address"));
  }
  if (seen.size !== rows.length) {
    throw new Error("Bulk renderer left claimed rows unaccounted for");
  }
  return { settlements, sendable };
}

type BatchPass =
  | { kind: "busy" }
  | {
      kind: "settled";
      outcome: BulkBatchOutcome | null;
      size: number;
      counts: SettleCounts;
    };

/**
 * S2, one transaction: the content lock (bounded), the lane try-lock, the
 * renderer, the request, the settle, and the spacing while still holding the
 * lane. `progress.requested` is set just before the request: from then on a
 * failure must leave the rows `processing` for the lease to bring back.
 */
async function sendBatchOnce(
  claim: BulkClaim,
  renderer: BulkEmailRenderer,
  lockTimeoutMs: number,
  spacingMs: number,
  progress: { requested: boolean },
): Promise<BatchPass> {
  try {
    return await sendBatchInTransaction(
      claim,
      renderer,
      lockTimeoutMs,
      spacingMs,
      progress,
    );
  } catch (error) {
    // A busy lane rolls back, freeing the content lock for an edit waiting.
    if (error instanceof TransactionRollbackError) return { kind: "busy" };
    throw error;
  }
}

function sendBatchInTransaction(
  claim: BulkClaim,
  renderer: BulkEmailRenderer,
  lockTimeoutMs: number,
  spacingMs: number,
  progress: { requested: boolean },
): Promise<Extract<BatchPass, { kind: "settled" }>> {
  return db.transaction(async (tx) => {
    // For the content lock only: the settle after the request must not time
    // out, or a batch Resend took would be left unsettled.
    await tx.execute(
      sql`SELECT set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`,
    );
    await renderer.lockContent(tx, claim.campaignId);
    await tx.execute(sql`SET LOCAL lock_timeout = DEFAULT`);
    // A try-lock, so no connection ever waits on the lane.
    const lane = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(${BULK_LANE_LOCK_NAMESPACE}, 0) AS locked`,
    );
    if (lane.rows[0]?.locked !== true) tx.rollback();

    const prepared = await renderer.prepare(tx, claim.campaignId, claim.rows);
    const { settlements, sendable } = partitionPrepared(claim.rows, prepared);
    if (sendable.length === 0) {
      const counts = await settleRows(tx, claim.owner, settlements);
      return { kind: "settled", outcome: null, size: 0, counts };
    }

    progress.requested = true;
    let response: BulkBatchResponse | null;
    try {
      response = await sendBatchEmails(
        sendable.map(({ email }) => email),
        { idempotencyKey: claim.batchKey, batchValidation: "permissive" },
      );
    } catch {
      response = null;
    }
    const outcome = bulkBatchOutcome(response, sendable.length);
    sendable.forEach(({ row, revision }, index) => {
      settlements.push(requestSettlement(outcome, row, revision, index));
    });

    let counts: SettleCounts;
    try {
      counts = await settleRows(tx, claim.owner, settlements);
      if (outcome.kind === "quota") {
        counts.failed += await failNeverBatched(tx, claim, outcome.error);
      }
    } catch (error) {
      // The lane lock lasts until the rollback: keep the spacing anyway.
      await wait(spacingMs);
      throw error;
    }
    await wait(spacingMs);
    return { kind: "settled", outcome, size: sendable.length, counts };
  });
}

export type BulkStopReason =
  /** Nothing left to claim. */
  | "idle"
  /** Less than the reserve was left; the claim in hand was handed back. */
  | "reserve"
  /** The content lock was not free in time; the claim was handed back. */
  | "lock_timeout"
  /** A database error before the request, twice in the run. */
  | "transient"
  | "quota"
  | "config"
  | "throttled"
  /** A failure after the request: those rows wait for their lease. */
  | "error";

export type BulkEmailRun = {
  expired: number;
  /** Claims taken. */
  batches: number;
  /** Batch requests that may have reached Resend. */
  requests: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Rows back in `pending` after an attempt. */
  retry: number;
  /** Rows handed back untried. */
  released: number;
  throttles: number;
  /** Times the lane lock was held by another server. */
  busy: number;
  stopped: BulkStopReason;
};

function addCounts(run: BulkEmailRun, counts: SettleCounts) {
  run.sent += counts.sent;
  run.skipped += counts.skipped;
  run.failed += counts.failed;
  run.retry += counts.retry;
}

function logBatch(
  claim: BulkClaim,
  pass: Extract<BatchPass, { kind: "settled" }>,
  ms: number,
) {
  const { outcome } = pass;
  const line = {
    campaignId: claim.campaignId,
    size: pass.size,
    outcome: outcome?.kind ?? "no_request",
    attempt: Math.max(...claim.rows.map((row) => row.attempts)) + 1,
    ms,
  };
  // Names, status codes and counts only: a refusal's message, and an item's,
  // can echo the address.
  switch (outcome?.kind) {
    case undefined:
    case "replay":
      console.log("[comunicados] batch", line);
      return;
    case "accepted": {
      const rejected = outcome.rejected.filter(Boolean).length;
      console.log(
        "[comunicados] batch",
        rejected ? { ...line, rejected } : line,
      );
      if (outcome.mismatch) {
        console.error("[comunicados] batch id mismatch", {
          campaignId: claim.campaignId,
          size: pass.size,
        });
      }
      return;
    }
    case "throttled":
      console.warn("[comunicados] batch", {
        ...line,
        retryAfterMs: outcome.retryAfterMs,
      });
      return;
    case "quota":
      console.error("[comunicados] Resend quota exceeded", {
        campaignId: claim.campaignId,
        code: outcome.error,
      });
      return;
    case "config":
      console.error("[comunicados] Resend refused the configuration", {
        code: outcome.error,
      });
      return;
    case "unknown":
    case "refused":
      console.warn("[comunicados] batch", {
        ...line,
        error: outcome.error,
        statusCode: outcome.statusCode,
      });
      return;
  }
}

/**
 * The bulk email step: expiry, then batches one after another until nothing
 * is due, less than the reserve is left, or Resend says to stop. For one
 * campaign with `campaignId`, else lane-wide within each renderer's scope.
 *
 * `deadline` is on the app's clock (`now`, `Date.now` by default); due-ness
 * and every backoff are on the database's. Errors outside a batch (the
 * expiry, a claim, handing a claim back) are thrown for the caller to log.
 * `renderers` and `timing` replace the registry and the waits, for tests.
 */
export async function sendBulkEmails(opts: {
  campaignId?: number;
  deadline: number;
  renderers?: BulkEmailRenderers;
  timing?: Partial<BulkTiming>;
  now?: () => number;
}): Promise<BulkEmailRun> {
  const renderers = opts.renderers ?? BULK_EMAIL_RENDERERS;
  const timing: BulkTiming = { ...BULK_TIMING, ...opts.timing };
  const now = opts.now ?? Date.now;
  const run: BulkEmailRun = {
    expired: 0,
    batches: 0,
    requests: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    retry: 0,
    released: 0,
    throttles: 0,
    busy: 0,
    stopped: "idle",
  };

  run.expired = await expireBulkEmails();
  if (Object.keys(renderers).length === 0) return run;

  let transientReleases = 0;
  for (;;) {
    const claim = await claimBulkBatch(renderers, opts.campaignId);
    if (!claim) {
      run.stopped = "idle";
      return run;
    }
    run.batches += 1;
    const renderer = renderers[claim.templateKey]!;
    const startedAt = Date.now();
    const lastStart = Math.min(
      opts.deadline - timing.reserveMs,
      now() + MAX_CLAIM_WAIT_MS,
    );

    const release = async (reason: BulkStopReason) => {
      const counts = await releaseClaim(claim);
      run.released += counts.retry;
      run.skipped += counts.skipped;
      return reason;
    };

    let pass: Extract<BatchPass, { kind: "settled" }> | null = null;
    let stop: BulkStopReason | null = null;
    while (!pass && !stop) {
      if (now() > lastStart) {
        stop = await release("reserve");
        break;
      }
      const progress = { requested: false };
      try {
        const attempt = await sendBatchOnce(
          claim,
          renderer,
          contentLockTimeoutMs(opts.deadline, now(), timing),
          timing.spacingMs,
          progress,
        );
        if (attempt.kind === "busy") {
          run.busy += 1;
          await wait(timing.lockPollMs);
          continue;
        }
        pass = attempt;
      } catch (error) {
        if (progress.requested) {
          // Resend may have the batch: never hand it back. Its lease brings
          // it back under the same key, marked as possibly sent.
          run.requests += 1;
          console.error("[comunicados] batch not settled after its request", {
            campaignId: claim.campaignId,
            ...errorShape(error),
          });
          run.stopped = "error";
          return run;
        }
        if (isLockNotAvailable(error)) {
          console.warn("[comunicados] batch handed back: content locked", {
            campaignId: claim.campaignId,
          });
          stop = await release("lock_timeout");
        } else if (isTransientDbError(error)) {
          console.warn("[comunicados] batch handed back: database error", {
            campaignId: claim.campaignId,
            ...errorShape(error),
          });
          await release("transient");
          transientReleases += 1;
          if (transientReleases >= MAX_TRANSIENT_RELEASES_PER_RUN) {
            stop = "transient";
          }
          break;
        } else {
          console.error("[comunicados] batch could not be rendered", {
            campaignId: claim.campaignId,
            size: claim.rows.length,
            ...errorShape(error),
          });
          addCounts(run, await spendClaim(claim));
          break;
        }
      }
    }
    if (stop) {
      run.stopped = stop;
      return run;
    }
    if (!pass) continue;

    addCounts(run, pass.counts);
    if (pass.outcome) run.requests += 1;
    logBatch(claim, pass, Date.now() - startedAt);

    switch (pass.outcome?.kind) {
      case "quota":
        run.stopped = "quota";
        return run;
      case "config":
        run.stopped = "config";
        return run;
      case "throttled": {
        run.throttles += 1;
        if (run.throttles >= MAX_THROTTLES_PER_RUN) {
          run.stopped = "throttled";
          return run;
        }
        const waitMs = throttleWaitMs(
          pass.outcome.retryAfterMs,
          timing.maxThrottleWaitMs,
        );
        if (!hasBatchTime(opts.deadline, now() + waitMs, timing.reserveMs)) {
          run.stopped = "reserve";
          return run;
        }
        await wait(waitMs);
        break;
      }
    }
  }
}
