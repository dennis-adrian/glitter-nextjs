// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import NotificationFailureSummaryPanel from "@/app/components/notifications/admin/notification-failure-summary";
import type { NotificationFailureSummary } from "@/app/lib/notifications/admin-log-failures-definitions";

afterEach(cleanup);

const UNTIL = new Date("2026-11-10T20:00:00Z");

function summary(
  overrides: Partial<NotificationFailureSummary> = {},
): NotificationFailureSummary {
  return {
    since: new Date(UNTIL.getTime() - 24 * 3_600_000),
    until: UNTIL,
    counts: { email: 0, push: 0 },
    patterns: [],
    ...overrides,
  };
}

describe("NotificationFailureSummaryPanel", () => {
  it("says so in one line when nothing failed", () => {
    render(<NotificationFailureSummaryPanel summary={summary()} />);
    expect(screen.getByText("Sin fallas en las últimas 24 horas")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("links each channel with failures to the list filtered to them", () => {
    render(
      <NotificationFailureSummaryPanel
        summary={summary({ counts: { email: 3, push: 0 } })}
      />,
    );
    const link = screen.getByRole("link", { name: "Correos: 3" });
    const url = new URL(link.getAttribute("href")!, "https://example.test");
    expect(url.searchParams.get("channel")).toBe("email");
    expect(url.searchParams.get("status")).toBe("failed");
    expect(screen.getByText("Avisos push: 0")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Avisos push/ })).toBeNull();
  });

  it("warns about a pattern and states the rule behind it", () => {
    render(
      <NotificationFailureSummaryPanel
        summary={summary({
          counts: { email: 0, push: 12 },
          patterns: [
            {
              channel: "push",
              error: "push_403",
              platform: "fcm",
              recipients: 12,
              failures: 12,
              from: new Date("2026-11-10T18:02:00Z"),
              to: new Date("2026-11-10T18:20:00Z"),
            },
          ],
        })}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "12 dispositivos de Chrome y Android fallaron con «push_403»",
    );
    expect(alert.textContent).toContain("VAPID");
    expect(alert.textContent).toContain(
      "5 o más correos o dispositivos distintos",
    );
  });
});
