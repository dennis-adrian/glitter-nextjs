// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The pure rules only: nothing here reaches the database or Resend.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/vendors/resend", () => ({ sendBatchEmails: vi.fn() }));

import {
  BULK_TIMING,
  type BulkBatchOutcome,
  bulkBatchOutcome,
  type BulkRowState,
  contentLockTimeoutMs,
  hasBatchTime,
  isTransientDbError,
  mapPermissiveBatch,
  precheckSettlement,
  releaseSettlement,
  renderFailureSettlement,
  requestSettlement,
  throttleDelaySeconds,
  throttleWaitMs,
  unknownBackoffSeconds,
} from "@/app/lib/notifications/bulk-email";

const MAYBE = new Date("2026-10-25T10:00:00Z");

function row(overrides: Partial<BulkRowState> = {}): BulkRowState {
  return {
    id: 7,
    attempts: 0,
    maybeSentAt: null,
    lastError: null,
    ...overrides,
  };
}

function refusal(name: string, statusCode = 422, headers = {}) {
  return {
    data: null,
    error: { name, message: "echoes ana@example.test", statusCode },
    headers,
  };
}

function accepted(ids: string[], errors: { index: number }[] = []) {
  return { data: { data: ids.map((id) => ({ id })), errors }, error: null };
}

describe("bulkBatchOutcome", () => {
  it("maps every Resend answer to its row of the outcome table", () => {
    expect(bulkBatchOutcome(null, 3)).toEqual({
      kind: "unknown",
      error: "timeout",
      statusCode: null,
    });
    for (const name of [
      "application_error",
      "internal_server_error",
      "concurrent_idempotent_requests",
    ]) {
      expect(bulkBatchOutcome(refusal(name, 500), 3)).toEqual({
        kind: "unknown",
        error: `resend:${name}`,
        statusCode: 500,
      });
    }
    expect(
      bulkBatchOutcome(refusal("invalid_idempotent_request", 409), 3),
    ).toEqual({ kind: "replay" });
    for (const name of ["daily_quota_exceeded", "monthly_quota_exceeded"]) {
      expect(bulkBatchOutcome(refusal(name, 429), 3)).toMatchObject({
        kind: "quota",
        error: `resend:${name}`,
      });
    }
    for (const name of [
      "invalid_api_key",
      "missing_api_key",
      "restricted_api_key",
      "invalid_from_address",
      "security_error",
    ]) {
      expect(bulkBatchOutcome(refusal(name, 403), 3)).toMatchObject({
        kind: "config",
        error: `resend:${name}`,
      });
    }
    for (const name of [
      "validation_error",
      "invalid_idempotency_key",
      "not_found",
    ]) {
      expect(bulkBatchOutcome(refusal(name), 3)).toEqual({
        kind: "refused",
        error: `resend:${name}`,
        statusCode: 422,
      });
    }
  });

  it("reads an answer that does not say what it refused as unknown, so its key is kept", () => {
    // The SDK passes any JSON error body through, with no name or status.
    expect(
      bulkBatchOutcome(
        { data: null, error: { message: "Endpoint request timed out" } },
        3,
      ),
    ).toEqual({ kind: "unknown", error: "resend:unknown", statusCode: null });
    expect(bulkBatchOutcome(refusal("some_new_error", 503), 3)).toEqual({
      kind: "unknown",
      error: "resend:some_new_error",
      statusCode: 503,
    });
    // A named refusal below 500 still proves nothing went out.
    expect(bulkBatchOutcome(refusal("some_new_error", 400), 3)).toMatchObject({
      kind: "refused",
    });
  });

  it("reads a throttle's Retry-After, and none when it has none", () => {
    expect(
      bulkBatchOutcome(
        refusal("rate_limit_exceeded", 429, { "retry-after": "3" }),
        3,
      ),
    ).toEqual({ kind: "throttled", retryAfterMs: 3000 });
    expect(bulkBatchOutcome(refusal("rate_limit_exceeded", 429), 3)).toEqual({
      kind: "throttled",
      retryAfterMs: null,
    });
  });

  it("never carries a refusal's message into what it records", () => {
    const outcome = bulkBatchOutcome(refusal("validation_error"), 3);
    expect(JSON.stringify(outcome)).not.toContain("@");
  });

  it("treats an answer with neither data nor an error as unknown", () => {
    expect(bulkBatchOutcome({ data: null, error: null }, 2)).toMatchObject({
      kind: "unknown",
    });
  });

  it("marks the development no-op as simulated", () => {
    expect(
      bulkBatchOutcome(
        { ...accepted(["not-sent", "not-sent"]), simulated: true },
        2,
      ),
    ).toMatchObject({ kind: "accepted", simulated: true, mismatch: false });
  });
});

describe("mapPermissiveBatch", () => {
  it("gives data[i] to the i-th payload index that errors do not list", () => {
    expect(
      mapPermissiveBatch(
        5,
        [{ id: "a" }, { id: "b" }, { id: "c" }],
        [{ index: 1 }, { index: 3 }],
      ),
    ).toEqual({
      providerIds: ["a", null, "b", null, "c"],
      rejected: [false, true, false, true, false],
      mismatch: false,
    });
  });

  it("maps a strict answer, with no errors, one to one", () => {
    expect(mapPermissiveBatch(2, [{ id: "a" }, { id: "b" }], [])).toEqual({
      providerIds: ["a", "b"],
      rejected: [false, false],
      mismatch: false,
    });
  });

  it("trusts no id when the counts do not add up to the payload", () => {
    expect(mapPermissiveBatch(3, [{ id: "a" }], [{ index: 2 }])).toEqual({
      providerIds: [null, null, null],
      rejected: [false, false, true],
      mismatch: true,
    });
    expect(
      mapPermissiveBatch(2, [{ id: "a" }, { id: "b" }, { id: "c" }], []),
    ).toMatchObject({ providerIds: [null, null], mismatch: true });
  });

  it("trusts no id when an error index is out of range or repeated", () => {
    expect(
      mapPermissiveBatch(3, [{ id: "a" }, { id: "b" }], [{ index: 3 }]),
    ).toEqual({
      providerIds: [null, null, null],
      rejected: [false, false, false],
      mismatch: true,
    });
    expect(
      mapPermissiveBatch(3, [{ id: "a" }], [{ index: 0 }, { index: 0 }]),
    ).toMatchObject({ rejected: [true, false, false], mismatch: true });
    expect(
      mapPermissiveBatch(2, [{ id: "a" }], [{ index: "1" }]),
    ).toMatchObject({ mismatch: true });
  });
});

describe("requestSettlement", () => {
  const outcome = (o: BulkBatchOutcome) => o;

  it("sends a 200's rows with their ids and the rendered revision", () => {
    const answer = bulkBatchOutcome(accepted(["re_1", "re_2"]), 2);
    expect(requestSettlement(answer, row(), 4, 1)).toEqual({
      id: 7,
      status: "sent",
      lastError: null,
      attempts: 0,
      providerMessageId: "re_2",
      contentRevision: 4,
      delaySeconds: null,
      maybeSent: "keep",
      batchKey: "keep",
      sentAt: true,
    });
  });

  it("fails only a permissive item's own row, clearing maybe_sent_at", () => {
    const answer = bulkBatchOutcome(accepted(["re_1"], [{ index: 1 }]), 2);
    expect(
      requestSettlement(answer, row({ maybeSentAt: MAYBE, attempts: 2 }), 4, 1),
    ).toMatchObject({
      status: "failed",
      lastError: "resend:item_rejected",
      maybeSent: "clear",
      batchKey: "keep",
      attempts: 2,
      providerMessageId: null,
      contentRevision: null,
      sentAt: false,
    });
    expect(requestSettlement(answer, row(), 4, 0)).toMatchObject({
      status: "sent",
      providerMessageId: "re_1",
    });
  });

  it("still sends every row that is not an error when ids cannot be matched", () => {
    const answer = bulkBatchOutcome(accepted(["re_1"], [{ index: 2 }]), 3);
    expect(requestSettlement(answer, row(), 4, 0)).toMatchObject({
      status: "sent",
      providerMessageId: null,
      contentRevision: 4,
    });
    expect(requestSettlement(answer, row(), 4, 2)).toMatchObject({
      status: "failed",
      lastError: "resend:item_rejected",
    });
  });

  it("records a simulated send as sent, with its revision and no id", () => {
    const answer = bulkBatchOutcome(
      { ...accepted(["not-sent"]), simulated: true },
      1,
    );
    expect(requestSettlement(answer, row(), 3, 0)).toMatchObject({
      status: "sent",
      lastError: "simulated",
      providerMessageId: null,
      contentRevision: 3,
      sentAt: true,
    });
  });

  it("records a 409 replay as sent with no revision", () => {
    expect(
      requestSettlement(
        outcome({ kind: "replay" }),
        row({ maybeSentAt: MAYBE }),
        3,
        0,
      ),
    ).toMatchObject({
      status: "sent",
      lastError: "idempotent_replay",
      providerMessageId: null,
      contentRevision: null,
      batchKey: "keep",
      sentAt: true,
    });
  });

  it("keeps the key on an unknown outcome, spends an attempt and marks it maybe sent", () => {
    const unknown = outcome({
      kind: "unknown",
      error: "resend:application_error",
      statusCode: 500,
    });
    expect(
      requestSettlement(unknown, row({ attempts: 2 }), 3, 0),
    ).toMatchObject({
      status: "pending",
      lastError: "resend:application_error",
      attempts: 3,
      delaySeconds: 120,
      maybeSent: "mark",
      batchKey: "keep",
      sentAt: false,
    });
    expect(
      requestSettlement(unknown, row({ attempts: 4 }), 3, 0),
    ).toMatchObject({
      status: "failed",
      lastError: "outcome_unknown",
      attempts: 5,
      delaySeconds: null,
      maybeSent: "mark",
      batchKey: "keep",
    });
  });

  it("does not spend an attempt on a throttle, and drops the key only without maybe_sent_at", () => {
    const throttled = outcome({ kind: "throttled", retryAfterMs: 7_500 });
    expect(
      requestSettlement(throttled, row({ attempts: 1 }), 3, 0),
    ).toMatchObject({
      status: "pending",
      lastError: "resend:rate_limit_exceeded",
      attempts: 1,
      delaySeconds: 8,
      batchKey: "drop",
      maybeSent: "keep",
    });
    expect(
      requestSettlement(throttled, row({ maybeSentAt: MAYBE }), 3, 0),
    ).toMatchObject({ batchKey: "keep" });
  });

  it("fails a quota-stopped row nothing reached, and holds one that may have landed", () => {
    const quota = outcome({
      kind: "quota",
      error: "resend:monthly_quota_exceeded",
      statusCode: 429,
    });
    expect(requestSettlement(quota, row({ attempts: 1 }), 3, 0)).toMatchObject({
      status: "failed",
      lastError: "resend:monthly_quota_exceeded",
      attempts: 1,
      batchKey: "drop",
      delaySeconds: null,
    });
    expect(
      requestSettlement(quota, row({ maybeSentAt: MAYBE, attempts: 1 }), 3, 0),
    ).toMatchObject({
      status: "pending",
      lastError: "resend:monthly_quota_exceeded",
      attempts: 1,
      batchKey: "keep",
      delaySeconds: 3600,
    });
  });

  it("holds a configuration refusal for 15 minutes without spending an attempt", () => {
    const config = outcome({
      kind: "config",
      error: "resend:invalid_api_key",
      statusCode: 403,
    });
    expect(requestSettlement(config, row({ attempts: 2 }), 3, 0)).toMatchObject(
      {
        status: "pending",
        lastError: "resend:invalid_api_key",
        attempts: 2,
        delaySeconds: 900,
        batchKey: "drop",
      },
    );
    expect(
      requestSettlement(config, row({ maybeSentAt: MAYBE }), 3, 0),
    ).toMatchObject({ batchKey: "keep" });
  });

  it("spends an attempt on any other refusal and fails at the fifth", () => {
    const refused = outcome({
      kind: "refused",
      error: "resend:validation_error",
      statusCode: 422,
    });
    expect(requestSettlement(refused, row(), 3, 0)).toMatchObject({
      status: "pending",
      lastError: "resend:validation_error",
      attempts: 1,
      delaySeconds: 30,
      batchKey: "drop",
    });
    expect(
      requestSettlement(
        refused,
        row({ attempts: 4, maybeSentAt: MAYBE }),
        3,
        0,
      ),
    ).toMatchObject({
      status: "failed",
      lastError: "resend:validation_error",
      attempts: 5,
      batchKey: "keep",
    });
  });
});

describe("settlements outside a request", () => {
  it("hands a claim back untouched: no attempt, no mark, the key kept, due now", () => {
    expect(
      releaseSettlement(
        row({ attempts: 2, maybeSentAt: MAYBE, lastError: "timeout" }),
      ),
    ).toEqual({
      id: 7,
      status: "pending",
      lastError: "timeout",
      attempts: 2,
      providerMessageId: null,
      contentRevision: null,
      delaySeconds: 0,
      maybeSent: "keep",
      batchKey: "keep",
      sentAt: false,
    });
  });

  it("spends an attempt on a render failure, dropping the key only without maybe_sent_at", () => {
    expect(renderFailureSettlement(row())).toMatchObject({
      status: "pending",
      lastError: "render_failed",
      attempts: 1,
      delaySeconds: 30,
      batchKey: "drop",
    });
    expect(
      renderFailureSettlement(row({ attempts: 1, maybeSentAt: MAYBE })),
    ).toMatchObject({ attempts: 2, delaySeconds: 60, batchKey: "keep" });
    expect(renderFailureSettlement(row({ attempts: 4 }))).toMatchObject({
      status: "failed",
      lastError: "render_failed",
      attempts: 5,
      delaySeconds: null,
    });
    expect(
      renderFailureSettlement(row({ attempts: 4, maybeSentAt: MAYBE })),
    ).toMatchObject({ status: "failed", lastError: "outcome_unknown" });
  });

  it("settles a pre-check result as it is, keeping the key as history", () => {
    expect(
      precheckSettlement(
        row({ maybeSentAt: MAYBE }),
        "failed",
        "address_changed",
      ),
    ).toMatchObject({
      status: "failed",
      lastError: "address_changed",
      maybeSent: "keep",
      batchKey: "keep",
      attempts: 0,
    });
    expect(precheckSettlement(row(), "skipped", "")).toMatchObject({
      status: "skipped",
      lastError: "unknown",
    });
  });
});

describe("timing", () => {
  it("starts no batch with less than the reserve left", () => {
    expect(hasBatchTime(100_000, 75_000, 25_000)).toBe(true);
    expect(hasBatchTime(100_000, 75_001, 25_000)).toBe(false);
  });

  it("bounds the content lock's wait between 1 s and 15 s before the reserve", () => {
    const deadline = 100_000;
    expect(contentLockTimeoutMs(deadline, 0, BULK_TIMING)).toBe(15_000);
    expect(contentLockTimeoutMs(deadline, 70_000, BULK_TIMING)).toBe(5_000);
    // Never 0, which turns lock_timeout off, nor negative, which SET refuses.
    expect(contentLockTimeoutMs(deadline, 75_000, BULK_TIMING)).toBe(1_000);
    expect(contentLockTimeoutMs(deadline, 99_000, BULK_TIMING)).toBe(1_000);
    expect(
      contentLockTimeoutMs(deadline, 99_000, {
        ...BULK_TIMING,
        minLockTimeoutMs: 0,
      }),
    ).toBe(1);
  });

  it("backs off 30 s, doubling, up to 15 minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(unknownBackoffSeconds)).toEqual([
      30, 60, 120, 240, 480, 900, 900,
    ]);
  });

  it("waits out a throttle at least 2 s, as Retry-After asks, at most a day", () => {
    expect(throttleDelaySeconds(null)).toBe(2);
    expect(throttleDelaySeconds(500)).toBe(2);
    expect(throttleDelaySeconds(2_100)).toBe(3);
    expect(throttleDelaySeconds(10 ** 12)).toBe(86_400);
    expect(throttleWaitMs(null, 5_000)).toBe(2_000);
    expect(throttleWaitMs(3_000, 5_000)).toBe(3_000);
    expect(throttleWaitMs(60_000, 5_000)).toBe(5_000);
  });
});

describe("isTransientDbError", () => {
  const wrapped = (cause: unknown) =>
    Object.assign(new Error("Failed query: …"), { cause });

  it("knows D2's transient SQLSTATEs and lost connections, through a wrapper", () => {
    for (const code of ["40P01", "40001", "55P03", "57014", "08006", "57P01"]) {
      expect(isTransientDbError(wrapped({ code }))).toBe(true);
    }
    expect(
      isTransientDbError(Object.assign(new Error("x"), { code: "ECONNRESET" })),
    ).toBe(true);
    expect(
      isTransientDbError(new Error("Connection terminated unexpectedly")),
    ).toBe(true);
  });

  it("does not count a renderer's own failure, or a constraint", () => {
    expect(isTransientDbError(new Error("render failed"))).toBe(false);
    expect(isTransientDbError(wrapped({ code: "23514" }))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });
});
