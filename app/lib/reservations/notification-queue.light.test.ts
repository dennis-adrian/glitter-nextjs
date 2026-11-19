// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The promise `notification-queue.ts` makes to the services that queue mail:
// writing a job, inbox copy included, needs no send key and no env.
vi.mock("@/env", () => {
  throw new Error("queuing a job imported the server env");
});
vi.mock("@/app/vendors/resend", () => {
  throw new Error("queuing a job imported Resend");
});
// Writing a push delivery is one INSERT in `notify()`; sending it is the
// worker's, with its keys and library.
vi.mock("@/app/vendors/web-push", () => {
  throw new Error("queuing a job imported the push sender");
});
vi.mock("@/app/lib/notifications/push/config", () => {
  throw new Error("queuing a job imported the VAPID keys");
});
vi.mock("@/db", () => ({ db: {} }));

describe("notification-queue", () => {
  // The notification registry pulls in the email templates, so this one cold
  // import takes 15-19s on a loaded machine, past the suite-wide 15s.
  it("loads without the env schema or Resend", async () => {
    await expect(
      import("@/app/lib/reservations/notification-queue"),
    ).resolves.toHaveProperty("enqueueReservationNotification");
  }, 60_000);
});
