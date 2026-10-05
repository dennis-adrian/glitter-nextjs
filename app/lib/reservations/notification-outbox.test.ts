// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Delivers an outbox job through the real `sendEmail` and Resend SDK with the
 * HTTP reply mocked. Resend resolves a rejected send instead of throwing, so
 * only an actual error reply shows whether the job is retried or wrongly
 * stamped completed.
 */

const { claimed, updates, reservationFindFirst } = vi.hoisted(() => ({
  /** The job row the claim reads back. */
  claimed: { current: null as Record<string, unknown> | null },
  /** Every `update().set()` after the claim, in order. */
  updates: [] as Array<Record<string, unknown>>,
  reservationFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/env", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", VERCEL_ENV: "production" },
}));
vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        const isClaim = values.status === "processing";
        if (!isClaim) updates.push(values);

        return {
          where: () =>
            Object.assign(Promise.resolve([]), {
              // Only the claim reads its row back.
              returning: async () =>
                isClaim && claimed.current ? [claimed.current] : [],
            }),
        };
      },
    }),
    query: { standReservations: { findFirst: reservationFindFirst } },
  },
}));

import { attemptReservationNotificationJob } from "@/app/lib/reservations/notification-outbox";

const job = {
  id: 91,
  deduplicationKey: "reservation_created:7:admin@example.com",
  userId: 3,
  reservationId: 7,
  notificationKind: "reservation_created",
  recipientEmail: "admin@example.com",
  payload: { reservationId: 7 },
  status: "processing",
  lastError: null,
  attempts: 0,
  nextAttemptAt: new Date(),
  leaseOwner: "owner",
  leaseExpiresAt: null,
  completedAt: null,
  updatedAt: new Date(),
  createdAt: new Date(),
};

const reservation = {
  id: 7,
  festivalId: 2,
  ownerUserId: 3,
  status: "pending",
  stand: { label: "A", standNumber: 4, standCategory: "illustration" },
  members: [],
  festival: { name: "Glitter Fest", festivalDates: [] },
  participants: [],
  invoices: [],
};

const fetchMock = vi.fn();

function resendReply(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function resendError(name: string, statusCode: number) {
  return () =>
    resendReply(
      { name, statusCode, message: `${name} from Resend` },
      statusCode,
    );
}

function claimNext(overrides: Partial<typeof job> = {}) {
  claimed.current = { ...job, ...overrides };
}

describe("reservation notification outbox delivery", () => {
  beforeEach(() => {
    updates.length = 0;
    reservationFindFirst.mockReset();
    reservationFindFirst.mockResolvedValue(reservation);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // The SDK logs every API error outside production.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reschedules the job when Resend rejects the send", async () => {
    claimNext();
    fetchMock.mockImplementation(resendError("validation_error", 422));

    await expect(attemptReservationNotificationJob(job.id)).resolves.toEqual({
      processed: true,
      status: "retry",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "validation_error: validation_error from Resend",
    });
    expect(updates[0]?.nextAttemptAt).toBeInstanceOf(Date);
  });

  it("fails the job once a rejected send runs out of attempts", async () => {
    claimNext({ attempts: 4 });
    fetchMock.mockImplementation(resendError("rate_limit_exceeded", 429));

    await expect(attemptReservationNotificationJob(job.id)).resolves.toEqual({
      processed: true,
      status: "failed",
    });

    expect(updates[0]).toMatchObject({ status: "failed", attempts: 5 });
  });

  it("completes the job and keys the send on it", async () => {
    claimNext();
    fetchMock.mockImplementation(async () =>
      resendReply({ id: "email-1" }, 200),
    );

    await expect(attemptReservationNotificationJob(job.id)).resolves.toEqual({
      processed: true,
      status: "completed",
    });

    expect(updates[0]).toMatchObject({ status: "completed", lastError: null });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      "production:reservation-notification-91",
    );
  });

  it("completes the job when its key already went out with another body", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    claimNext();
    fetchMock.mockImplementation(
      resendError("invalid_idempotent_request", 409),
    );

    await expect(attemptReservationNotificationJob(job.id)).resolves.toEqual({
      processed: true,
      status: "completed",
    });

    expect(updates[0]).toMatchObject({ status: "completed" });
  });

  it("retries the job while another send under its key is in flight", async () => {
    claimNext();
    fetchMock.mockImplementation(
      resendError("concurrent_idempotent_requests", 409),
    );

    await expect(attemptReservationNotificationJob(job.id)).resolves.toEqual({
      processed: true,
      status: "retry",
    });
  });
});
