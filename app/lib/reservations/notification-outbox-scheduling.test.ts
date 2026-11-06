// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What runs once a reservation change has committed: its outbox jobs, and the
 * pushes their inbox copies queued. Both go to `after()` as one promise, so
 * the platform keeps the function alive until all of it settles.
 */

const { afterMock, drainMock, claimMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  drainMock: vi.fn(async () => undefined),
  claimMock: vi.fn(async () => [] as unknown[]),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("@/env", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", VERCEL_ENV: "production" },
}));
vi.mock("@/app/lib/notifications/deliveries", () => ({
  drainDuePushDeliveries: drainMock,
}));
vi.mock("@/db", () => ({
  db: {
    // The job claim: nothing to claim, or a failure when the test says so.
    update: () => ({
      set: () => ({ where: () => ({ returning: claimMock }) }),
    }),
  },
}));

import { scheduleReservationNotificationJobs } from "@/app/lib/reservations/notification-outbox";

function scheduledWork() {
  expect(afterMock).toHaveBeenCalledTimes(1);
  const callback = afterMock.mock.calls[0][0] as () => unknown;
  return callback();
}

describe("scheduleReservationNotificationJobs", () => {
  beforeEach(() => {
    afterMock.mockReset();
    drainMock.mockClear();
    claimMock.mockReset();
    claimMock.mockResolvedValue([]);
  });

  it("hands after() the jobs and the push drain as one promise", async () => {
    scheduleReservationNotificationJobs([4, 4, 9]);

    const work = scheduledWork();
    expect(work).toBeInstanceOf(Promise);
    await work;
    expect(claimMock).toHaveBeenCalledTimes(2);
    expect(drainMock).toHaveBeenCalledTimes(1);
  });

  it("still sends the pushes when a job attempt fails", async () => {
    claimMock.mockRejectedValueOnce(new Error("connection reset"));
    scheduleReservationNotificationJobs([4]);

    await expect(scheduledWork()).resolves.toBeDefined();
    expect(drainMock).toHaveBeenCalledTimes(1);
  });

  it("schedules nothing without a job", () => {
    scheduleReservationNotificationJobs([]);
    expect(afterMock).not.toHaveBeenCalled();
  });
});
