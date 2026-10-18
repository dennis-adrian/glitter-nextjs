// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The routes cron-job.org calls, and the two it never had, all need the
 * scheduler's `Authorization: Bearer <CRON_SECRET>`. Anything else is refused
 * before the job runs.
 */

const handlers = vi.hoisted(() => ({
  handleOrderCancellations: vi.fn(),
  handleOrderPaymentReminders: vi.fn(),
  handleOrphanedProductImages: vi.fn(),
  handleDeletionEmails: vi.fn(),
  handleReminderEmails: vi.fn(),
  handleReservationReminderEmails: vi.fn(),
  processExpiredWaitlistNotifications: vi.fn(),
}));

vi.mock("@/app/lib/orders/scheduled-actions", () => ({
  handleOrderCancellations: handlers.handleOrderCancellations,
  handleOrderPaymentReminders: handlers.handleOrderPaymentReminders,
}));
vi.mock("@/app/lib/products/scheduled-actions", () => ({
  handleOrphanedProductImages: handlers.handleOrphanedProductImages,
}));
vi.mock("@/app/lib/profile_tasks/actions", () => ({
  handleDeletionEmails: handlers.handleDeletionEmails,
  handleReminderEmails: handlers.handleReminderEmails,
  handleReservationReminderEmails: handlers.handleReservationReminderEmails,
}));
vi.mock("@/app/lib/festival_activites/scheduled-actions", () => ({
  processExpiredWaitlistNotifications:
    handlers.processExpiredWaitlistNotifications,
}));

import { GET as orderCancellations } from "@/app/api/cron/morning/orderCancellations/route";
import { GET as orderPaymentReminders } from "@/app/api/cron/morning/orderPaymentReminders/route";
import { GET as orphanedProductImages } from "@/app/api/cron/morning/orphanedProductImages/route";
import { GET as profileDeletion } from "@/app/api/cron/morning/profileDeletion/route";
import { GET as profileReminders } from "@/app/api/cron/morning/profileReminders/route";
import { GET as reservationReminders } from "@/app/api/cron/morning/reservationReminders/route";
import { GET as waitlistNotifications } from "@/app/api/cron/morning/waitlistNotifications/route";

const SECRET = "cron-secret-for-tests";

const ROUTES = [
  ["orderCancellations", orderCancellations, handlers.handleOrderCancellations],
  [
    "orderPaymentReminders",
    orderPaymentReminders,
    handlers.handleOrderPaymentReminders,
  ],
  [
    "orphanedProductImages",
    orphanedProductImages,
    handlers.handleOrphanedProductImages,
  ],
  ["profileDeletion", profileDeletion, handlers.handleDeletionEmails],
  ["profileReminders", profileReminders, handlers.handleReminderEmails],
  [
    "reservationReminders",
    reservationReminders,
    handlers.handleReservationReminderEmails,
  ],
  [
    "waitlistNotifications",
    waitlistNotifications,
    handlers.processExpiredWaitlistNotifications,
  ],
] as const;

function cronRequest(authorization?: string) {
  return new Request("https://example.test/api/cron/morning/job", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  for (const handler of Object.values(handlers)) {
    handler.mockReset();
    handler.mockResolvedValue([]);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(ROUTES)("%s cron route", (_name, GET, handler) => {
  it("runs the job for the scheduler's bearer secret", async () => {
    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer not-the-secret"],
    ["a malformed scheme", `Bearer. ${SECRET}`],
    ["the bare secret", SECRET],
  ])("refuses %s without running the job", async (_case, authorization) => {
    const response = await GET(cronRequest(authorization));

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses every caller when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(cronRequest("Bearer "));

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});
