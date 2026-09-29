import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OccurrenceActionsMenu from "@/app/components/dashboard/programs/occurrence-actions-menu";
import type { SessionOccurrence } from "@/app/lib/programs/definitions";

vi.mock("@/app/lib/programs/occurrence-actions", () => ({
  cancelOccurrence: vi.fn(),
  completeOccurrence: vi.fn(),
  deleteOccurrence: vi.fn(),
  rescheduleOccurrence: vi.fn(),
  setOccurrenceSalesClosed: vi.fn(),
}));

const NOW = new Date("2026-10-01T15:00:00.000Z");

function occurrenceEndingAt(endsAt: Date): SessionOccurrence {
  return {
    id: 1,
    sessionId: 1,
    startsAt: new Date(endsAt.getTime() - 2 * 60 * 60 * 1000),
    endsAt,
    venueId: null,
    room: null,
    capacity: 20,
    salesStartAt: null,
    salesEndAt: null,
    salesClosedAt: null,
    lifecycleStatus: "scheduled",
    cancelledAt: null,
    cancelledReason: null,
    completedAt: null,
    rescheduledAt: null,
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
  };
}

function salesToggle() {
  return screen.getByRole("button", { name: "Cerrar ventas" });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("OccurrenceActionsMenu sales toggle", () => {
  it("disables itself at the end without another render", () => {
    render(
      <OccurrenceActionsMenu
        occurrence={occurrenceEndingAt(new Date(NOW.getTime() + 10_000))}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect((salesToggle() as HTMLButtonElement).disabled).toBe(false);
    expect(salesToggle().parentElement?.getAttribute("title")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect((salesToggle() as HTMLButtonElement).disabled).toBe(true);
    expect(salesToggle().parentElement?.getAttribute("title")).toMatch(
      /Las ventas cerraron al terminar el horario/,
    );
  });

  it("enables itself again when a reschedule moves the end into the future", () => {
    const { rerender } = render(
      <OccurrenceActionsMenu
        occurrence={occurrenceEndingAt(new Date(NOW.getTime() - 60_000))}
      />,
    );
    expect((salesToggle() as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <OccurrenceActionsMenu
        occurrence={occurrenceEndingAt(new Date(NOW.getTime() + 60_000))}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect((salesToggle() as HTMLButtonElement).disabled).toBe(false);
  });

  it("leaves no timer behind once unmounted", () => {
    const { unmount } = render(
      <OccurrenceActionsMenu
        occurrence={occurrenceEndingAt(new Date(NOW.getTime() + 60_000))}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
