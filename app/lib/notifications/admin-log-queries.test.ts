import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdmin: vi.fn() }));

import {
  notificationLogDayBounds,
  notificationLogLinks,
  parseLogTimestamp,
} from "@/app/lib/notifications/admin-log-queries";

const noLinks = {
  campaign_id: null,
  reservation_id: null,
  entity_type: null,
  entity_id: null,
} as const;

describe("notificationLogDayBounds", () => {
  it("reads days in Bolivia (UTC-4) as UTC wall-clock bounds", () => {
    expect(notificationLogDayBounds("2026-11-10", "2026-11-10")).toEqual({
      from: "2026-11-10T04:00:00.000",
      toExclusive: "2026-11-11T04:00:00.000",
    });
  });

  it("leaves an open end open and swaps a reversed range", () => {
    expect(notificationLogDayBounds(undefined, undefined)).toEqual({
      from: null,
      toExclusive: null,
    });
    expect(notificationLogDayBounds("2026-11-10")).toEqual({
      from: "2026-11-10T04:00:00.000",
      toExclusive: null,
    });
    expect(notificationLogDayBounds("2026-11-12", "2026-11-10")).toEqual({
      from: "2026-11-10T04:00:00.000",
      toExclusive: "2026-11-13T04:00:00.000",
    });
  });
});

describe("parseLogTimestamp", () => {
  it("reads the driver's UTC wall time", () => {
    expect(parseLogTimestamp("2026-11-10 14:03:22.123")?.toISOString()).toBe(
      "2026-11-10T14:03:22.123Z",
    );
    expect(parseLogTimestamp("2026-11-10T14:03:22Z")?.toISOString()).toBe(
      "2026-11-10T14:03:22.000Z",
    );
  });

  it("passes dates through and drops what is not one", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    expect(parseLogTimestamp(date)).toBe(date);
    expect(parseLogTimestamp(null)).toBeNull();
    expect(parseLogTimestamp("nunca")).toBeNull();
  });
});

describe("notificationLogLinks", () => {
  it("links each campaign type to its own page", () => {
    expect(
      notificationLogLinks(
        { ...noLinks, campaign_id: 7 },
        { type: "comunicado", title: "x", festivalId: null },
      ),
    ).toEqual([
      {
        label: "Ver reporte del comunicado",
        href: "/dashboard/communications/7",
      },
    ]);
    expect(
      notificationLogLinks(
        { ...noLinks, campaign_id: 8 },
        { type: "credit_gift", title: "x", festivalId: null },
      ),
    ).toEqual([{ label: "Ver el regalo", href: "/dashboard/credits/gifts/8" }]);
    expect(
      notificationLogLinks(
        { ...noLinks, campaign_id: 9 },
        { type: "reservations_open", title: "x", festivalId: 3 },
      ),
    ).toEqual([{ label: "Ver el festival", href: "/dashboard/festivals/3" }]);
    // A notice whose festival row is gone links nowhere rather than guessing.
    expect(
      notificationLogLinks(
        { ...noLinks, campaign_id: 9 },
        { type: "stands_available", title: "x", festivalId: null },
      ),
    ).toEqual([]);
  });

  it("links a reservation and a disciplinary case", () => {
    expect(
      notificationLogLinks({ ...noLinks, reservation_id: 5 }, null),
    ).toEqual([
      { label: "Ver la reserva", href: "/dashboard/reservations/5/edit" },
    ]);
    expect(
      notificationLogLinks(
        { ...noLinks, entity_type: "sanction", entity_id: 2 },
        null,
      ),
    ).toEqual([{ label: "Ver la sanción", href: "/dashboard/sanctions/2" }]);
    expect(
      notificationLogLinks(
        { ...noLinks, entity_type: "infraction", entity_id: 4 },
        null,
      ),
    ).toEqual([
      { label: "Ver la infracción", href: "/dashboard/infractions/4" },
    ]);
  });
});
