// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import StatusHistoryList, {
  statusEventActor,
} from "@/app/components/users/status-history/status-history-list";
import type { StatusHistoryPage } from "@/app/lib/users/status-history";

const USER_ID = 7;
const ADMIN = {
  displayName: "Dennis",
  firstName: "Dennis",
  lastName: "G",
  email: "admin@example.com",
};

function history(
  events: StatusHistoryPage["events"],
  extra: Partial<StatusHistoryPage> = {},
): StatusHistoryPage {
  return { events, page: 1, hasMore: false, ...extra };
}

const EVENTS: StatusHistoryPage["events"] = [
  {
    id: 3,
    fromStatus: "rejected",
    toStatus: "pending",
    reason: "Nueva revisión pedida por el participante.",
    createdAt: new Date("2026-10-02T15:30:00Z"),
    createdByUserId: USER_ID,
    createdBy: { ...ADMIN, displayName: "Ana" },
  },
  {
    id: 2,
    fromStatus: "pending",
    toStatus: "rejected",
    reason: "La foto no es tuya.",
    createdAt: new Date("2026-10-01T12:00:00Z"),
    createdByUserId: 1,
    createdBy: ADMIN,
  },
  {
    id: 1,
    fromStatus: "verified",
    toStatus: "banned",
    reason: null,
    createdAt: new Date("2026-09-01T12:00:00Z"),
    createdByUserId: null,
    createdBy: null,
  },
];

describe("StatusHistoryList", () => {
  afterEach(cleanup);

  it("lists each change in order with Spanish labels, reason and author", () => {
    render(
      <StatusHistoryList
        userId={USER_ID}
        history={history(EVENTS)}
        basePath="/dashboard/users/7"
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Rechazado → Por verificar")).toBeTruthy();
    expect(within(items[0]).getByText(/Por el participante/)).toBeTruthy();
    expect(within(items[1]).getByText("Por verificar → Rechazado")).toBeTruthy();
    expect(within(items[1]).getByText("La foto no es tuya.")).toBeTruthy();
    expect(within(items[1]).getByText(/Por Dennis/)).toBeTruthy();
    expect(within(items[2]).getByText("Verificado → Deshabilitado")).toBeTruthy();
    expect(within(items[2]).getByText(/Por —/)).toBeTruthy();
    expect(
      within(items[1])
        .getByText((_, el) => el?.tagName === "TIME")
        .getAttribute("dateTime"),
    ).toBe("2026-10-01T12:00:00.000Z");
  });

  it("says plainly when nothing was recorded", () => {
    render(
      <StatusHistoryList
        userId={USER_ID}
        history={history([])}
        basePath="/dashboard/users/7"
      />,
    );

    expect(
      screen.getByText(/Sin cambios de estado registrados/).textContent,
    ).toContain("21 de agosto de 2026");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("pages with links when there is more", () => {
    render(
      <StatusHistoryList
        userId={USER_ID}
        history={history(EVENTS, { page: 2, hasMore: true })}
        basePath="/dashboard/users/7"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Más recientes" }).getAttribute("href"),
    ).toBe("/dashboard/users/7#historial");
    expect(
      screen.getByRole("link", { name: "Anteriores" }).getAttribute("href"),
    ).toBe("/dashboard/users/7?historial=3#historial");
  });
});

describe("statusEventActor", () => {
  it("names a deleted author with a dash", () => {
    expect(
      statusEventActor({ createdByUserId: 1, createdBy: null }, USER_ID),
    ).toBe("—");
  });

  it("falls back to the email when the admin has no name", () => {
    expect(
      statusEventActor(
        {
          createdByUserId: 1,
          createdBy: {
            displayName: null,
            firstName: null,
            lastName: null,
            email: "admin@example.com",
          },
        },
        USER_ID,
      ),
    ).toBe("admin@example.com");
  });
});
