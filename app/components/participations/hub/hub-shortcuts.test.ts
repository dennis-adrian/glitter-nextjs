import { describe, expect, it } from "vitest";

import {
  buildDesktopShortcuts,
  buildHubShortcuts,
} from "@/app/components/participations/hub/hub-shortcuts";
import type { ParticipationHub } from "@/app/lib/participations/hub";
import type { HubStatus } from "@/app/lib/participations/hub-status";

function hub(
  status: HubStatus,
  overrides: Partial<ParticipationHub> = {},
): ParticipationHub {
  const isConfirmed = status === "confirmed_reservation";
  return {
    status,
    isConfirmed,
    reservation: isConfirmed ? { id: 41 } : null,
    festival: { festivalDates: [{ startDate: new Date() }] },
    activities: [{ id: 1 }],
    sessions: [{ id: 1 }],
    links: {
      terms: "/terms",
      reserve: "/reserve",
      invoices: "/invoices",
      products: "/products",
      team: "/team",
      reservation: "/reservations/41",
      map: "/map",
      publicTerms: "/festivals/9/terms",
    },
    ...overrides,
  } as unknown as ParticipationHub;
}

const keys = (shortcuts: { key: string; disabled?: boolean }[]) =>
  shortcuts.map((shortcut) => `${shortcut.key}${shortcut.disabled ? " (off)" : ""}`);

describe("buildHubShortcuts", () => {
  it("shows the team and activities dimmed before the stand is confirmed", () => {
    expect(keys(buildHubShortcuts(hub("approved_enrollment")))).toEqual([
      "team (off)",
      "schedule",
      "activities (off)",
      "programs",
    ]);
  });

  it("puts the reservation's pages in the same grid once confirmed", () => {
    const shortcuts = buildHubShortcuts(hub("confirmed_reservation"));
    expect(keys(shortcuts)).toEqual([
      "reservation",
      "payments",
      "products",
      "team",
      "schedule",
      "activities",
      "programs",
      "terms",
    ]);
    expect(shortcuts.find((s) => s.key === "reservation")?.href).toBe(
      "/reservations/41",
    );
    expect(shortcuts.find((s) => s.key === "terms")?.href).toBe(
      "/festivals/9/terms",
    );
  });

  it("drops what the festival does not have", () => {
    expect(
      keys(
        buildHubShortcuts(
          hub("confirmed_reservation", { activities: [], sessions: [] }),
        ),
      ),
    ).toEqual(["reservation", "payments", "products", "team", "schedule", "terms"]);
  });

  it("leaves out the reservation tile when there is no single reservation page", () => {
    const shortcuts = buildHubShortcuts(
      hub("confirmed_reservation", {
        links: {
          ...hub("confirmed_reservation").links,
          reservation: null,
        },
      }),
    );
    expect(shortcuts.map((s) => s.key)).not.toContain("reservation");
    expect(shortcuts.filter((s) => s.href === "/invoices")).toHaveLength(1);
  });

  it("has nothing to open once the participation ended", () => {
    expect(buildHubShortcuts(hub("rejected_reservation"))).toEqual([]);
  });
});

describe("buildDesktopShortcuts", () => {
  it("only links the confirmed reservation's outside pages", () => {
    expect(buildDesktopShortcuts(hub("approved_enrollment"))).toEqual([]);
    expect(keys(buildDesktopShortcuts(hub("confirmed_reservation")))).toEqual([
      "reservation",
      "payments",
      "products",
      "terms",
    ]);
  });
});

describe("shortcutColumns", () => {
  it("never leaves a tile alone on the last row", async () => {
    const { shortcutColumns } = await import(
      "@/app/components/participations/hub/hub-quick-access"
    );
    for (let count = 1; count <= 8; count++) {
      const columns = shortcutColumns(count);
      const lastRow = count % columns || columns;
      expect(count === 1 || lastRow > 1).toBe(true);
    }
    expect(shortcutColumns(7)).toBe(4);
    expect(shortcutColumns(4)).toBe(4);
    expect(shortcutColumns(3)).toBe(3);
  });
});
