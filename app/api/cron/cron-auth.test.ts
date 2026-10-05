// @vitest-environment node
import { readdirSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({
  handleOrderCancellations: vi.fn(),
  handleOrderPaymentReminders: vi.fn(),
  handleOrphanedProductImages: vi.fn(),
  handleReminderEmails: vi.fn(),
  handleReservationReminderEmails: vi.fn(),
  expireAbandonedHolds: vi.fn(),
  expireWaitlistInvitations: vi.fn(),
  sendSessionDayReminders: vi.fn(),
  processPendingReservationNotificationJobs: vi.fn(),
  reconcileSanctionFestivalCounting: vi.fn(),
  processPendingDisciplinaryNotificationJobs: vi.fn(),
  cleanupExpiredHolds: vi.fn(),
  processPendingStorageCleanupJobs: vi.fn(),
  processExpiredWaitlistNotifications: vi.fn(),
  publishDueScheduledPosts: vi.fn(),
}));

vi.mock("@/app/lib/orders/scheduled-actions", () => ({
  handleOrderCancellations: jobs.handleOrderCancellations,
  handleOrderPaymentReminders: jobs.handleOrderPaymentReminders,
}));
vi.mock("@/app/lib/products/scheduled-actions", () => ({
  handleOrphanedProductImages: jobs.handleOrphanedProductImages,
}));
vi.mock("@/app/lib/profile_tasks/actions", () => ({
  handleReminderEmails: jobs.handleReminderEmails,
  handleReservationReminderEmails: jobs.handleReservationReminderEmails,
}));
vi.mock("@/app/lib/programs/scheduled-actions", () => ({
  expireAbandonedHolds: jobs.expireAbandonedHolds,
  expireWaitlistInvitations: jobs.expireWaitlistInvitations,
  sendSessionDayReminders: jobs.sendSessionDayReminders,
}));
vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  processPendingReservationNotificationJobs:
    jobs.processPendingReservationNotificationJobs,
}));
vi.mock("@/app/lib/sanctions/festival-counting", () => ({
  reconcileSanctionFestivalCounting: jobs.reconcileSanctionFestivalCounting,
}));
vi.mock("@/app/lib/infractions/notifications", () => ({
  processPendingDisciplinaryNotificationJobs:
    jobs.processPendingDisciplinaryNotificationJobs,
}));
vi.mock("@/app/lib/reservations/hold-service", () => ({
  cleanupExpiredHolds: jobs.cleanupExpiredHolds,
}));
vi.mock("@/app/lib/uploadthing/actions", () => ({
  processPendingStorageCleanupJobs: jobs.processPendingStorageCleanupJobs,
}));
vi.mock("@/app/lib/festival_activites/scheduled-actions", () => ({
  processExpiredWaitlistNotifications: jobs.processExpiredWaitlistNotifications,
}));
vi.mock("@/app/lib/posts/schedule", () => ({
  publishDueScheduledPosts: jobs.publishDueScheduledPosts,
}));

type CronRoute = {
  GET: (request: Request) => Promise<Response>;
};

const SECRET = "test-cron-secret";

/**
 * Every cron route that must refuse a caller without `CRON_SECRET`, keyed by
 * its path under `app/api/cron`, with the job(s) it runs.
 */
const GUARDED_ROUTES: Record<
  string,
  { load: () => Promise<CronRoute>; jobs: (keyof typeof jobs)[] }
> = {
  "morning/orderCancellations": {
    load: () => import("@/app/api/cron/morning/orderCancellations/route"),
    jobs: ["handleOrderCancellations"],
  },
  "morning/orderPaymentReminders": {
    load: () => import("@/app/api/cron/morning/orderPaymentReminders/route"),
    jobs: ["handleOrderPaymentReminders"],
  },
  "morning/orphanedProductImages": {
    load: () => import("@/app/api/cron/morning/orphanedProductImages/route"),
    jobs: ["handleOrphanedProductImages"],
  },
  "morning/profileReminders": {
    load: () => import("@/app/api/cron/morning/profileReminders/route"),
    jobs: ["handleReminderEmails"],
  },
  "morning/reservationReminders": {
    load: () => import("@/app/api/cron/morning/reservationReminders/route"),
    jobs: ["handleReservationReminderEmails"],
  },
  "morning/waitlistNotifications": {
    load: () => import("@/app/api/cron/morning/waitlistNotifications/route"),
    jobs: ["processExpiredWaitlistNotifications"],
  },
  "morning/programHoldExpiration": {
    load: () => import("@/app/api/cron/morning/programHoldExpiration/route"),
    jobs: ["expireAbandonedHolds", "expireWaitlistInvitations"],
  },
  "morning/programSessionReminders": {
    load: () => import("@/app/api/cron/morning/programSessionReminders/route"),
    jobs: ["sendSessionDayReminders"],
  },
  "morning/reservationNotifications": {
    load: () => import("@/app/api/cron/morning/reservationNotifications/route"),
    jobs: ["processPendingReservationNotificationJobs"],
  },
  "morning/sanctionFestivalCounting": {
    load: () => import("@/app/api/cron/morning/sanctionFestivalCounting/route"),
    jobs: [
      "reconcileSanctionFestivalCounting",
      "processPendingDisciplinaryNotificationJobs",
    ],
  },
  "morning/standHoldExpiration": {
    load: () => import("@/app/api/cron/morning/standHoldExpiration/route"),
    jobs: ["cleanupExpiredHolds"],
  },
  "morning/storageCleanup": {
    load: () => import("@/app/api/cron/morning/storageCleanup/route"),
    jobs: ["processPendingStorageCleanupJobs"],
  },
  "publish-scheduled-posts": {
    load: () => import("@/app/api/cron/publish-scheduled-posts/route"),
    jobs: ["publishDueScheduledPosts"],
  },
};

/**
 * Still callable without the secret. `profileDeletion` is run by a scheduler
 * outside `vercel.json`, and locking it before that scheduler sends
 * `Authorization: Bearer ${CRON_SECRET}` would stop it without an error
 * anyone sees. Remove it from here once the scheduler is confirmed.
 */
const PENDING_SCHEDULER_CONFIRMATION = ["morning/profileDeletion"];

function findCronRoutes(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const routePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const children = findCronRoutes(path.join(dir, entry.name), routePath);
    const hasRoute = readdirSync(path.join(dir, entry.name)).includes(
      "route.ts",
    );
    return hasRoute ? [routePath, ...children] : children;
  });
}

function request(authorization?: string) {
  return new Request("http://localhost/api/cron/job", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("cron route authorization", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    for (const job of Object.values(jobs)) {
      job.mockReset();
      job.mockResolvedValue({});
    }
    jobs.handleOrderCancellations.mockResolvedValue(0);
    jobs.handleOrphanedProductImages.mockResolvedValue(0);
    jobs.handleReminderEmails.mockResolvedValue([]);
    jobs.handleReservationReminderEmails.mockResolvedValue([]);
    jobs.expireAbandonedHolds.mockResolvedValue({ expired: 0 });
    jobs.expireWaitlistInvitations.mockResolvedValue({ expired: 0 });
    jobs.publishDueScheduledPosts.mockResolvedValue({ promoted: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("classifies every route under app/api/cron", () => {
    const routes = findCronRoutes(path.join(process.cwd(), "app/api/cron"));

    expect(routes.sort()).toEqual(
      [
        ...Object.keys(GUARDED_ROUTES),
        ...PENDING_SCHEDULER_CONFIRMATION,
      ].sort(),
    );
  });

  describe.each(Object.entries(GUARDED_ROUTES))("%s", (_, route) => {
    it("rejects a request without the secret and runs nothing", async () => {
      const { GET } = await route.load();

      const response = await GET(request());

      expect(response.status).toBe(401);
      for (const job of route.jobs) {
        expect(jobs[job]).not.toHaveBeenCalled();
      }
    });

    it("rejects a wrong secret", async () => {
      const { GET } = await route.load();

      const response = await GET(request("Bearer not-the-cron-secret"));

      expect(response.status).toBe(401);
      for (const job of route.jobs) {
        expect(jobs[job]).not.toHaveBeenCalled();
      }
    });

    it("fails closed when CRON_SECRET is unset", async () => {
      vi.stubEnv("CRON_SECRET", "");
      const { GET } = await route.load();

      const response = await GET(request("Bearer "));

      expect(response.status).toBe(401);
      for (const job of route.jobs) {
        expect(jobs[job]).not.toHaveBeenCalled();
      }
    });

    it("runs the job for the scheduler's bearer secret", async () => {
      const { GET } = await route.load();

      const response = await GET(request(`Bearer ${SECRET}`));

      expect(response.status).toBe(200);
      for (const job of route.jobs) {
        expect(jobs[job]).toHaveBeenCalledTimes(1);
      }
    });
  });
});
