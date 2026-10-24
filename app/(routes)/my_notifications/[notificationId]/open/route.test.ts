// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(),
  notification: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/app/lib/notifications/queries", () => ({
  resolveInboxViewerWithAccess: mocks.viewer,
  fetchNotificationForViewer: mocks.notification,
}));
vi.mock("@/app/lib/notifications/actions", () => ({
  markNotificationReadAction: mocks.markRead,
}));

import { GET } from "./route";

const VIEWER = { id: 3, role: "user" };

/** Where opening `id` sends the person. */
async function open(id: string) {
  try {
    await GET(new Request(`https://glitter.test/my_notifications/${id}/open`), {
      params: Promise.resolve({ notificationId: id }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("redirect:")) return message.slice(9);
    throw error;
  }
  throw new Error("GET did not redirect");
}

beforeEach(() => {
  mocks.viewer.mockReset().mockResolvedValue(VIEWER);
  mocks.notification.mockReset();
  mocks.markRead.mockReset().mockResolvedValue({ success: true });
});

describe("opening a notification from the device", () => {
  it("marks it read and goes where the inbox would: a gift to the wallet", async () => {
    mocks.notification.mockResolvedValue({
      id: 41,
      readAt: null,
      actionPath: "/my_credits",
      opensDetail: false,
    });

    expect(await open("41")).toBe("/my_credits");
    expect(mocks.notification).toHaveBeenCalledWith(VIEWER, 41);
    expect(mocks.markRead).toHaveBeenCalledWith(41);
  });

  it("opens its own page when it carries a message someone wrote", async () => {
    mocks.notification.mockResolvedValue({
      id: 41,
      readAt: null,
      actionPath: "/my_credits",
      opensDetail: true,
    });

    expect(await open("41")).toBe("/my_notifications/41");
    expect(mocks.markRead).toHaveBeenCalledWith(41);
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

  it.each(["abc", "0", "-3", "99999999999"])(
    "sends an id like %s to the inbox",
    async (id) => {
      expect(await open(id)).toBe("/my_notifications");
      expect(mocks.viewer).not.toHaveBeenCalled();
    },
  );
});
