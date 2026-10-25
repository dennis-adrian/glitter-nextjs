import { describe, expect, it } from "vitest";

import {
  notificationDateGroup,
  notificationHref,
  notificationTapHref,
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

  it("hides Anuncios until there are announcements to file there", () => {
    expect(visibleNotificationFilters("user")).toEqual([
      "all",
      "reservations",
      "credits",
    ]);
    expect(parseNotificationFilter("announcements", "user")).toBe("all");
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

  it("opens a message's own page and a notice's destination", () => {
    expect(
      notificationHref({
        id: 4,
        actionPath: "/my_credits",
        opensDetail: true,
      }),
    ).toBe("/my_notifications/4");
    expect(
      notificationHref({
        id: 5,
        actionPath: "/my_credits",
        opensDetail: false,
      }),
    ).toBe("/my_credits");
    expect(
      notificationHref({
        id: 6,
        actionPath: null,
        opensDetail: false,
      }),
    ).toBe("/my_notifications/6");
    expect(
      notificationHref({
        id: 7,
        actionPath: "//evil.example",
        opensDetail: false,
      }),
    ).toBe("/my_notifications/7");
  });
});

describe("notificationTapHref", () => {
  it("goes where the inbox would, except a disciplinary notice to its own page", () => {
    const notice = {
      id: 8,
      actionPath: "/profiles/3/infractions",
      opensDetail: false,
    };
    expect(notificationTapHref(notice, false)).toBe("/profiles/3/infractions");
    expect(notificationTapHref(notice, true)).toBe("/my_notifications/8");
    expect(notificationTapHref({ ...notice, opensDetail: true }, false)).toBe(
      "/my_notifications/8",
    );
  });
});

describe("notificationDateGroup", () => {
  // Bolivia is UTC-4 all year.
  const now = new Date("2026-10-18T10:00:00-04:00");

  it("groups by calendar day, not by 24-hour windows", () => {
    expect(
      notificationDateGroup(new Date("2026-10-18T00:05:00-04:00"), now),
    ).toBe("today");
    expect(
      notificationDateGroup(new Date("2026-10-17T23:55:00-04:00"), now),
    ).toBe("yesterday");
    expect(
      notificationDateGroup(new Date("2026-10-13T12:00:00-04:00"), now),
    ).toBe("week");
    expect(
      notificationDateGroup(new Date("2026-10-11T12:00:00-04:00"), now),
    ).toBe("earlier");
  });

  it("uses Bolivia's calendar, so a UTC server and a browser agree", () => {
    // 21:00 in La Paz is already tomorrow in UTC. Seen the next morning it
    // is "Ayer" for everyone, whatever zone the code runs in.
    const evening = new Date("2026-10-17T21:00:00-04:00");
    const nextMorning = new Date("2026-10-18T10:00:00-04:00");
    expect(notificationDateGroup(evening, nextMorning)).toBe("yesterday");
  });
});

describe("safeActionPath", () => {
  it("refuses a backslash path a browser would read as another host", () => {
    expect(safeActionPath("/\\evil.example")).toBeNull();
  });

  it("refuses tabs and newlines the URL parser drops", () => {
    expect(safeActionPath("/\t/evil.example")).toBeNull();
    expect(safeActionPath("/\n\\evil.example")).toBeNull();
    expect(safeActionPath("/\r/evil.example")).toBeNull();
    expect(safeActionPath("/my_credits\n")).toBeNull();
  });

  it("refuses spaces and other control characters", () => {
    expect(safeActionPath("/my credits")).toBeNull();
    expect(safeActionPath("/my_credits\u0000")).toBeNull();
    expect(safeActionPath("/my_credits\u007f")).toBeNull();
  });

  it("refuses a path that resolves to one starting with //", () => {
    expect(safeActionPath("/.//evil.example")).toBeNull();
    expect(safeActionPath("/a/..//evil.example")).toBeNull();
  });

  it("keeps an app path as written, query and fragment included", () => {
    const path = "/dashboard/festivals/3/reservations?lens=cobros&focus=9#top";
    expect(safeActionPath(path)).toBe(path);
    expect(safeActionPath("/profiles/2/infractions")).toBe(
      "/profiles/2/infractions",
    );
  });
});
