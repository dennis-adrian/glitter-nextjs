import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OccurrenceScheduleList from "@/app/components/programs/occurrence-schedule-list";
import type { SessionOccurrence } from "@/app/lib/programs/definitions";
import type { OccurrenceAvailability } from "@/app/lib/programs/inventory";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
}));

vi.mock("@/app/lib/programs/registration-actions", () => ({
  getCurrentViewerProgramEligibility: vi.fn(async () => "public"),
}));

// The forms own their own flows; here only their presence matters.
vi.mock("@/app/components/programs/free-registration-form", () => ({
  default: () => <button type="button">Inscribirme</button>,
}));

vi.mock("@/app/components/programs/paid-registration-form", () => ({
  default: () => <button type="button">Reservar</button>,
}));

const STARTS_AT = new Date("2026-10-01T14:00:00.000Z");
const ENDS_AT = new Date("2026-10-01T16:00:00.000Z");
const BEFORE_START = new Date("2026-10-01T13:00:00.000Z");
const DURING = new Date("2026-10-01T15:00:00.000Z");
const AFTER_END = new Date("2026-10-01T17:00:00.000Z");

const occurrence: SessionOccurrence = {
  id: 1,
  sessionId: 1,
  startsAt: STARTS_AT,
  endsAt: ENDS_AT,
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

const availability: OccurrenceAvailability = {
  capacity: 20,
  validTickets: 5,
  activeHolds: 0,
  occupied: 5,
  remaining: 15,
  isSoldOut: false,
};

function renderList(renderedAt: Date) {
  return render(
    <OccurrenceScheduleList
      occurrences={[occurrence]}
      programStatus="published"
      sessionStatus="published"
      venuesById={new Map()}
      fallbackVenueId={null}
      programSlug="taller"
      sessionSlug="fanzines"
      sessionTitle="Fanzines"
      availabilityByOccurrence={new Map([[occurrence.id, availability]])}
      audience="all"
      publicPrice={0}
      participantPrice={0}
      renderedAt={renderedAt}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("OccurrenceScheduleList", () => {
  it("offers registration and seats before the occurrence starts", () => {
    vi.setSystemTime(BEFORE_START);
    renderList(BEFORE_START);

    expect(screen.getByRole("button", { name: "Inscribirme" })).toBeTruthy();
    expect(screen.getByText("15 de 20 cupos disponibles")).toBeTruthy();
  });

  it("keeps offering registration while the occurrence runs", () => {
    vi.setSystemTime(DURING);
    renderList(DURING);

    expect(screen.getByRole("button", { name: "Inscribirme" })).toBeTruthy();
    expect(screen.getByText("15 de 20 cupos disponibles")).toBeTruthy();
  });

  it("shows an occurrence that is over as held, without a form or seats", () => {
    vi.setSystemTime(AFTER_END);
    renderList(AFTER_END);

    expect(screen.getByText("Realizada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Inscribirme" })).toBeNull();
    expect(screen.queryByText(/cupos disponibles/)).toBeNull();
  });

  it("does not reopen a finished slot on a device whose clock is behind", () => {
    // Rendered after the end, viewed on a clock stuck during the session.
    vi.setSystemTime(DURING);
    renderList(AFTER_END);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText("Realizada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Inscribirme" })).toBeNull();
  });

  it("first renders what the cached HTML showed, then catches up with the clock", () => {
    // Cached HTML rendered during the session, opened after it: the first
    // render must match that HTML to hydrate, and only then close.
    vi.setSystemTime(AFTER_END);
    renderList(DURING);

    expect(screen.getByRole("button", { name: "Inscribirme" })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(screen.getByText("Realizada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Inscribirme" })).toBeNull();
  });

  it("closes on its own when left open across the end", () => {
    const justBefore = new Date(ENDS_AT.getTime() - 10_000);
    vi.setSystemTime(justBefore);
    renderList(justBefore);

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByRole("button", { name: "Inscribirme" })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("Realizada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Inscribirme" })).toBeNull();
  });
});
