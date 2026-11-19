// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(),
  notification: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/notifications/queries", () => ({
  resolveInboxViewerWithAccess: mocks.viewer,
  fetchNotificationForViewer: mocks.notification,
}));
vi.mock("@/app/lib/notifications/read", () => ({
  markNotificationRead: mocks.markRead,
}));

import { OPENED_NOTIFICATION_COOKIE } from "@/app/lib/notifications/push/taps";

import { GET } from "./route";

const VIEWER = { id: 3, role: "user" };

/** Where opening `id` sends the person, and the cookie it leaves. */
async function open(id: string, headers: Record<string, string> = {}) {
  const response = await GET(
    new Request(`https://glitter.test/my_notifications/${id}/open`, {
      headers,
    }),
    { params: Promise.resolve({ notificationId: id }) },
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const location = new URL(response.headers.get("location") ?? "");
  expect(location.origin).toBe("https://glitter.test");
  return location.pathname;
}

async function openedCookie(id: string) {
  const response = await GET(
    new Request(`https://glitter.test/my_notifications/${id}/open`),
    { params: Promise.resolve({ notificationId: id }) },
  );
  return response.cookies.get(OPENED_NOTIFICATION_COOKIE);
}

beforeEach(() => {
  mocks.viewer.mockReset().mockResolvedValue(VIEWER);
  mocks.notification.mockReset();
  mocks.markRead.mockReset().mockResolvedValue(undefined);
});

describe("opening a notification from the device", () => {
  it("marks it read and goes where the inbox would: a reservation update to its reservation", async () => {
    mocks.notification.mockResolvedValue({
      id: 41,
      kind: "reservation_confirmed",
      readAt: null,
      actionPath: "/profiles/3/festivals/2/reservations/9",
      opensDetail: false,
    });

    expect(await open("41")).toBe("/profiles/3/festivals/2/reservations/9");
    expect(mocks.notification).toHaveBeenCalledWith(VIEWER, 41);
    expect(mocks.markRead).toHaveBeenCalledWith(VIEWER, 41);
  });

  it("opens its own page when it carries text someone wrote, as a gift does", async () => {
    mocks.notification.mockResolvedValue({
      id: 41,
      kind: "credit_gift_received",
      readAt: null,
      actionPath: "/my_credits",
      opensDetail: true,
    });

    expect(await open("41")).toBe("/my_notifications/41");
    expect(mocks.markRead).toHaveBeenCalledWith(VIEWER, 41);
  });

  it("opens a disciplinary notice's own page, as its push said nothing", async () => {
    mocks.notification.mockResolvedValue({
      id: 41,
      kind: "infraction_registered",
      readAt: null,
      actionPath: "/profiles/3/infractions",
      opensDetail: false,
    });

    expect(await open("41")).toBe("/my_notifications/41");
    expect(mocks.markRead).toHaveBeenCalledWith(VIEWER, 41);
  });

  it.each(["same-origin", "same-site", "none"])(
    "marks it read when the request says it came from %s",
    async (site) => {
      mocks.notification.mockResolvedValue({
        id: 41,
        kind: "reservation_confirmed",
        readAt: null,
        actionPath: "/profiles/3/festivals/2/reservations/9",
        opensDetail: false,
      });

      await open("41", { "sec-fetch-site": site });
      expect(mocks.markRead).toHaveBeenCalledWith(VIEWER, 41);
    },
  );

  it("marks nothing for a link on another site, but still takes the person there", async () => {
    mocks.notification.mockResolvedValue({
      id: 41,
      kind: "reservation_confirmed",
      readAt: null,
      actionPath: "/profiles/3/festivals/2/reservations/9",
      opensDetail: false,
    });

    expect(await open("41", { "sec-fetch-site": "cross-site" })).toBe(
      "/profiles/3/festivals/2/reservations/9",
    );
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("does not mark it again when it was already read", async () => {
    mocks.notification.mockResolvedValue({
      id: 41,
      readAt: "2026-10-23T12:00:00.000Z",
      actionPath: "/my_credits",
      opensDetail: false,
    });

    expect(await open("41")).toBe("/my_credits");
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("still goes on when marking it read fails", async () => {
    mocks.notification.mockResolvedValue({
      id: 41,
      readAt: null,
      actionPath: "/my_credits",
      opensDetail: false,
    });
    mocks.markRead.mockRejectedValue(new Error("db down"));

    expect(await open("41")).toBe("/my_credits");
  });

  it("never follows a link that leaves the site", async () => {
    mocks.notification.mockResolvedValue({
      id: 41,
      readAt: null,
      actionPath: "https://evil.test/",
      opensDetail: false,
    });

    expect(await open("41")).toBe("/my_notifications/41");
  });

  it("sends to the inbox when the item is gone or not theirs", async () => {
    mocks.notification.mockResolvedValue(null);
    expect(await open("41")).toBe("/my_notifications");
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("sends to the item's page when the inbox is not open to them", async () => {
    mocks.viewer.mockResolvedValue(null);
    expect(await open("41")).toBe("/my_notifications/41");
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it("leaves a short-lived cookie naming it, so the page does not open the tap again", async () => {
    mocks.notification.mockResolvedValue({
      id: 41,
      readAt: null,
      actionPath: "/my_credits",
      opensDetail: false,
    });
    const cookie = await openedCookie("41");
    expect(cookie).toMatchObject({
      value: "41",
      maxAge: 120,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(cookie?.httpOnly).toBeFalsy();
  });

  it("leaves no cookie for an id that is not one", async () => {
    expect(await openedCookie("abc")).toBeUndefined();
  });

  it.each(["abc", "0", "-3", "99999999999"])(
    "sends an id like %s to the inbox",
    async (id) => {
      expect(await open(id)).toBe("/my_notifications");
      expect(mocks.viewer).not.toHaveBeenCalled();
    },
  );
});
