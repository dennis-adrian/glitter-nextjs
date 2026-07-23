import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    update: updateMock,
  },
}));
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
}));

import {
  attemptDisciplinaryNotificationJob,
  type DisciplinaryNotificationPayload,
} from "@/app/lib/infractions/notifications";

const payload: DisciplinaryNotificationPayload = {
  entityType: "infraction",
  kind: "registered",
  profile: {
    id: 12,
    email: "participant@example.com",
    displayName: "Participante",
    firstName: null,
    lastName: null,
  },
  infractionId: 42,
  typeLabel: "No show",
  festivalName: null,
  participantNote: null,
};

const job = {
  id: 91,
  deduplicationKey: "infraction:42:registered",
  userId: 12,
  entityType: "infraction",
  entityId: 42,
  notificationKind: "registered",
  recipientEmail: "participant@example.com",
  payload,
  status: "processing" as const,
  lastError: null,
  attempts: 0,
  nextAttemptAt: new Date("2026-07-23T10:00:00.000Z"),
  leaseOwner: null,
  leaseExpiresAt: null,
  completedAt: null,
  updatedAt: new Date("2026-07-23T10:00:00.000Z"),
  createdAt: new Date("2026-07-23T10:00:00.000Z"),
};

function mockUpdateResults(
  results: Array<Array<Record<string, unknown>>>,
  writtenValues: Array<Record<string, unknown>>,
) {
  const pendingResults = [...results];
  updateMock.mockImplementation(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      writtenValues.push(values);
      return {
        where: vi.fn(() => ({
          returning: vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(pendingResults.shift() ?? []),
            ),
        })),
      };
    }),
  }));
}

describe("disciplinary notification worker", () => {
  beforeEach(() => {
    updateMock.mockReset();
    sendEmailMock.mockReset();
  });

  it("reschedules a durable job when the email provider rejects it", async () => {
    const writtenValues: Array<Record<string, unknown>> = [];
    mockUpdateResults([[job], [{ status: "pending" }]], writtenValues);
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Provider unavailable" },
    });

    await expect(
      attemptDisciplinaryNotificationJob(job.id),
    ).resolves.toMatchObject({
      success: false,
      outcome: "rescheduled",
    });

    expect(writtenValues[1]).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "Provider unavailable",
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    expect(writtenValues[1]?.nextAttemptAt).toBeInstanceOf(Date);
  });

  it("marks the durable job completed after successful delivery", async () => {
    const writtenValues: Array<Record<string, unknown>> = [];
    mockUpdateResults([[job], [{ id: job.id }]], writtenValues);
    sendEmailMock.mockResolvedValue({
      data: { id: "email-1" },
      error: null,
    });

    await expect(
      attemptDisciplinaryNotificationJob(job.id),
    ).resolves.toMatchObject({
      success: true,
      outcome: "completed",
    });

    expect(writtenValues[1]).toMatchObject({
      status: "completed",
      attempts: 1,
      lastError: null,
    });
    expect(sendEmailMock.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: job.deduplicationKey,
    });
  });

  it("reuses the same provider idempotency key after a lost completion claim", async () => {
    const writtenValues: Array<Record<string, unknown>> = [];
    // First attempt: claim succeeds, send succeeds, complete returns empty (claim lost).
    // Second attempt: reclaim, send again with the same persisted key, then complete.
    mockUpdateResults([[job], [], [job], [{ id: job.id }]], writtenValues);
    sendEmailMock.mockResolvedValue({
      data: { id: "email-1" },
      error: null,
    });

    await expect(
      attemptDisciplinaryNotificationJob(job.id),
    ).resolves.toMatchObject({
      success: false,
      outcome: "claim_lost",
    });

    await expect(
      attemptDisciplinaryNotificationJob(job.id),
    ).resolves.toMatchObject({
      success: true,
      outcome: "completed",
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: job.deduplicationKey,
    });
    expect(sendEmailMock.mock.calls[1]?.[1]).toEqual({
      idempotencyKey: job.deduplicationKey,
    });
  });
});
