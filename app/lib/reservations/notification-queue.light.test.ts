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
vi.mock("@/db", () => ({ db: {} }));

describe("notification-queue", () => {
  it("loads without the env schema or Resend", async () => {
    await expect(
      import("@/app/lib/reservations/notification-queue"),
    ).resolves.toHaveProperty("enqueueReservationNotification");
  });
});
