// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => ({
  handleDeletionEmails: vi.fn(),
  handleReminderEmails: vi.fn(),
  handleReservationReminderEmails: vi.fn(),
}));

vi.mock("@/app/lib/profile_tasks/actions", () => handlers);

import { GET as profileDeletion } from "@/app/api/cron/morning/profileDeletion/route";
import { GET as profileReminders } from "@/app/api/cron/morning/profileReminders/route";
import { GET as reservationReminders } from "@/app/api/cron/morning/reservationReminders/route";

/** A task as the jobs return it: carrying the profile's full row. */
const TASK = {
  id: 1,
  profile: {
    id: 7,
    email: "ana@example.com",
    phoneNumber: "70000000",
    clerkId: "clerk_ana",
  },
};

const ROUTES = [
  [
    "profileDeletion",
    profileDeletion,
    handlers.handleDeletionEmails,
    "profilesDeleted",
  ],
  [
    "profileReminders",
    profileReminders,
    handlers.handleReminderEmails,
    "remindersSent",
  ],
  [
    "reservationReminders",
    reservationReminders,
    handlers.handleReservationReminderEmails,
    "remindersSent",
  ],
] as const;

beforeEach(() => {
  for (const handler of Object.values(handlers)) {
    handler.mockReset();
    handler.mockResolvedValue([TASK]);
  }
});

describe.each(ROUTES)("%s cron route", (_name, GET, handler, countKey) => {
  it("answers with a count, not profile rows", async () => {
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(JSON.parse(body)).toEqual({ data: { [countKey]: 1 } });
    expect(body).not.toContain("ana@example.com");
  });
});
