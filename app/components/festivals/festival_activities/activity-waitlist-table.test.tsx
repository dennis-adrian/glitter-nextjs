import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/lib/festival_activites/admin-actions", () => ({
  notifyWaitlistEntry: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { notifyWaitlistEntry } from "@/app/lib/festival_activites/admin-actions";
import type { WaitlistEntryWithUser } from "@/app/lib/festivals/definitions";
import ActivityWaitlistTable from "./activity-waitlist-table";

const RENDERED_AT = new Date("2026-10-01T15:00:00.000Z");
const EXPIRES_AT = new Date("2026-10-01T15:01:00.000Z");

const invited = {
  id: 5,
  activityId: 9,
  userId: 50,
  position: 1,
  notifiedAt: new Date("2026-10-01T14:00:00.000Z"),
  expiresAt: EXPIRES_AT,
  notifiedForDetailId: 2,
  updatedAt: RENDERED_AT,
  createdAt: RENDERED_AT,
  user: { id: 50, displayName: "Bea", imageUrl: null },
} as unknown as WaitlistEntryWithUser;

function beaRow() {
  return screen.getByText("Bea").closest("tr") as HTMLElement;
}

describe("ActivityWaitlistTable", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows an invitation as expired once it lapses with the page open", () => {
    vi.useFakeTimers();
    vi.setSystemTime(RENDERED_AT);
    render(
      <ActivityWaitlistTable
        entries={[invited]}
        festivalId={3}
        renderedAt={RENDERED_AT}
      />,
    );

    expect(within(beaRow()).getByText("Invitado")).toBeTruthy();
    expect(within(beaRow()).queryByRole("button")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(90_000);
    });

    expect(within(beaRow()).getByText("Invitación vencida")).toBeTruthy();
    expect(
      within(beaRow()).getByRole("button", { name: "Re-notificar" }),
    ).toBeTruthy();
  });

  it("first renders what the server saw, then catches up to the browser clock", () => {
    vi.useFakeTimers();
    // The browser clock is already past the expiry when the page hydrates.
    vi.setSystemTime(new Date(EXPIRES_AT.getTime() + 1_000));
    render(
      <ActivityWaitlistTable
        entries={[invited]}
        festivalId={3}
        renderedAt={RENDERED_AT}
      />,
    );

    expect(within(beaRow()).getByText("Invitado")).toBeTruthy();
    expect(within(beaRow()).queryByRole("button")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(within(beaRow()).getByText("Invitación vencida")).toBeTruthy();
    expect(
      within(beaRow()).getByRole("button", { name: "Re-notificar" }),
    ).toBeTruthy();
  });

  it("keeps a Notificar in flight disabled and focused across clock ticks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(RENDERED_AT);
    // The invitation email is still on its way.
    vi.mocked(notifyWaitlistEntry).mockReturnValue(new Promise(() => {}));
    const waiting = {
      ...invited,
      notifiedAt: null,
      expiresAt: null,
      notifiedForDetailId: null,
    } as unknown as WaitlistEntryWithUser;
    render(
      <ActivityWaitlistTable
        entries={[waiting]}
        festivalId={3}
        renderedAt={RENDERED_AT}
      />,
    );

    const button = within(beaRow()).getByRole("button", { name: "Notificar" });
    button.focus();
    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(90_000);
    });

    // The same element: a remount would drop focus and re-enable the button.
    expect(within(beaRow()).getByRole("button", { name: "Notificar" })).toBe(
      button,
    );
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(notifyWaitlistEntry).toHaveBeenCalledTimes(1);
  });
});
