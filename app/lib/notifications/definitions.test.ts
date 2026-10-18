import { describe, expect, it } from "vitest";

import {
  notificationDateGroup,
  notificationHref,
  parseNotificationFilter,
  safeActionPath,
  visibleNotificationFilters,
} from "@/app/lib/notifications/definitions";

describe("inbox filters", () => {
  it("shows Administración to the admin role alone", () => {
    expect(visibleNotificationFilters("admin")).toContain("admin");
    expect(visibleNotificationFilters("festival_admin")).not.toContain("admin");
    expect(visibleNotificationFilters("user")).not.toContain("admin");
  });

  it("falls back to all for an unknown or forbidden filter", () => {
    expect(parseNotificationFilter("credits", "user")).toBe("credits");
    expect(parseNotificationFilter("admin", "user")).toBe("all");
    expect(parseNotificationFilter("nope", "admin")).toBe("all");
    expect(parseNotificationFilter(["credits"], "user")).toBe("all");
  });
});

describe("links", () => {
  it("only follows app paths", () => {
    expect(safeActionPath("/my_credits")).toBe("/my_credits");
    expect(safeActionPath("//evil.example")).toBeNull();
    expect(safeActionPath("https://evil.example")).toBeNull();
    expect(safeActionPath(null)).toBeNull();
  });

  it("opens a gift's own page and a notice's destination", () => {
    expect(
      notificationHref({
        id: 4,
        kind: "credit_gift_received",
        actionPath: "/my_credits",
      }),
    ).toBe("/my_notifications/4");
    expect(
      notificationHref({
        id: 5,
        kind: "credit_gift_revoked",
        actionPath: "/my_credits",
      }),
    ).toBe("/my_credits");
    expect(
      notificationHref({
        id: 6,
        kind: "credit_gift_revoked",
        actionPath: null,
      }),
    ).toBe("/my_notifications/6");
  });
});

describe("notificationDateGroup", () => {
  const now = new Date(2026, 9, 18, 10, 0);

  it("groups by calendar day, not by 24-hour windows", () => {
    expect(notificationDateGroup(new Date(2026, 9, 18, 0, 5), now)).toBe(
      "today",
    );
    expect(notificationDateGroup(new Date(2026, 9, 17, 23, 55), now)).toBe(
      "yesterday",
    );
    expect(notificationDateGroup(new Date(2026, 9, 13, 12, 0), now)).toBe(
      "week",
    );
    expect(notificationDateGroup(new Date(2026, 9, 11, 12, 0), now)).toBe(
      "earlier",
    );
  });
});
