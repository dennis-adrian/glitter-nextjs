import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProgramRosterView from "@/app/components/dashboard/programs/enrollments/program-roster-view";
import type {
  ProgramRoster,
  ProgramRosterOccurrence,
  ProgramRosterSession,
  RosterEntry,
} from "@/app/lib/programs/occurrence-queries";

afterEach(cleanup);

beforeEach(() => {
  // jsdom has neither of these; Radix's Select opens on pointerdown and
  // scrolls the highlighted option into view when it does.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.releasePointerCapture = vi.fn();
});

function session(overrides: Partial<ProgramRosterSession> = {}): ProgramRosterSession {
  return {
    id: 10,
    title: "Taller A",
    type: "workshop",
    status: "published",
    ...overrides,
  };
}

function occurrence(
  overrides: Partial<ProgramRosterOccurrence> = {},
): ProgramRosterOccurrence {
  return {
    occurrenceId: 1,
    sessionId: 10,
    startsAt: new Date("2026-08-10T18:00:00.000Z"),
    endsAt: new Date("2026-08-10T20:00:00.000Z"),
    capacity: 2,
    venueName: "Sala 1",
    room: null,
    lifecycleStatus: "scheduled",
    rescheduledAt: null,
    salesStartAt: null,
    salesEndAt: null,
    salesClosedAt: null,
    ...overrides,
  };
}

function entry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    lineId: 1,
    purchaseId: 100,
    occurrenceId: 1,
    state: "confirmed",
    attendeeName: "Ana Gómez",
    attendeeEmail: "ana@example.com",
    attendeePhone: null,
    isGuest: false,
    ticketCode: "ABC123",
    unitPrice: 70,
    promoCode: null,
    promoPartnerName: null,
    isFree: false,
    holdExpiresAt: null,
    createdAt: new Date("2026-07-30T15:00:00.000Z"),
    ...overrides,
  };
}

function roster(overrides: Partial<ProgramRoster> = {}): ProgramRoster {
  return {
    now: new Date("2026-08-01T12:00:00.000Z"),
    programStatus: "published",
    sessions: [
      session({ id: 10, title: "Taller A" }),
      session({ id: 20, title: "Charla B", type: "talk" }),
    ],
    occurrences: [
      occurrence({ occurrenceId: 1, sessionId: 10, startsAt: new Date("2026-08-10T18:00:00.000Z") }),
      occurrence({ occurrenceId: 2, sessionId: 10, startsAt: new Date("2026-08-11T18:00:00.000Z") }),
      occurrence({
        occurrenceId: 3,
        sessionId: 20,
        startsAt: new Date("2026-08-09T10:00:00.000Z"),
        capacity: 3,
      }),
    ],
    entries: [
      entry({ lineId: 1, occurrenceId: 1, state: "confirmed", attendeeName: "Ana Gómez", purchaseId: 100 }),
      entry({ lineId: 2, occurrenceId: 1, state: "released", attendeeName: "Carlos Pérez", purchaseId: 101 }),
      entry({ lineId: 3, occurrenceId: 2, state: "holding", attendeeName: "Beto Ruiz", purchaseId: 102 }),
      entry({ lineId: 4, occurrenceId: 3, state: "confirmed", attendeeName: "Deb Soto", purchaseId: 103 }),
    ],
    waitlistByOccurrence: { 1: 2 },
    ...overrides,
  };
}

async function openSelect(trigger: HTMLElement) {
  fireEvent.click(trigger);
  return within(document.body).findByRole("listbox");
}

describe("ProgramRosterView", () => {
  it("shows the program-wide tiles regardless of filter", () => {
    render(<ProgramRosterView roster={roster()} />);
    // 2 confirmed, 1 holding, 1 released across the whole program.
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Confirmado")).toBeTruthy();
    expect(screen.getByText("Liberado")).toBeTruthy();
  });

  it("groups by session at the program level, ordered by earliest occurrence", () => {
    render(<ProgramRosterView roster={roster()} />);
    const rows = screen.getAllByRole("listitem");
    // Charla B's only occurrence starts before either of Taller A's.
    expect(within(rows[0]).getByText("Charla B")).toBeTruthy();
    expect(within(rows[1]).getByText("Taller A")).toBeTruthy();
  });

  it("drills into a session's occurrences when its row is clicked, then into its people", () => {
    render(<ProgramRosterView roster={roster()} />);

    fireEvent.click(screen.getByText("Taller A"));
    // Now at occurrence level: two occurrence rows, no session list.
    expect(screen.queryByText("Charla B")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    const [firstOccurrence] = screen.getAllByRole("listitem");
    fireEvent.click(
      within(firstOccurrence).getByRole("button", { name: /10 ago 2026/ }),
    );

    // Now at the flat roster for that one occurrence.
    expect(screen.getByText("Ana Gómez")).toBeTruthy();
  });

  it("cascades: changing the session clears a previously selected occurrence", async () => {
    render(<ProgramRosterView roster={roster()} />);

    const [sessionTrigger, occurrenceTrigger] = screen.getAllByRole("combobox");

    let listbox = await openSelect(sessionTrigger);
    fireEvent.click(within(listbox).getByText("Taller A"));

    listbox = await openSelect(occurrenceTrigger);
    fireEvent.click(within(listbox).getAllByRole("option")[1]); // first real occurrence option

    // Flat roster for the selected occurrence is now showing.
    expect(screen.getByText("Ana Gómez")).toBeTruthy();

    // Switching session must not leave the stale occurrence selected —
    // otherwise "session + unrelated occurrence" would be representable.
    listbox = await openSelect(sessionTrigger);
    fireEvent.click(within(listbox).getByText("Charla B"));

    expect(sessionTrigger.textContent).toMatch(/Charla B/);
    expect(occurrenceTrigger.textContent).toMatch(/Todos los horarios/);
  });

  it("hides released rows by default and reveals them via the Liberado tile", () => {
    render(<ProgramRosterView roster={roster()} />);

    fireEvent.click(screen.getByText("Taller A"));
    const [firstOccurrence] = screen.getAllByRole("listitem");
    fireEvent.click(within(firstOccurrence).getByRole("button", { name: "Ver inscritos" }));

    expect(screen.getByText("Ana Gómez")).toBeTruthy();
    expect(screen.queryByText("Carlos Pérez")).toBeNull();

    fireEvent.click(screen.getByText("Liberado"));

    expect(screen.getByText("Carlos Pérez")).toBeTruthy();
  });

  it("keeps the headline occupied count excluding released regardless of the toggle", () => {
    render(<ProgramRosterView roster={roster()} />);
    // Taller A: 1 confirmed + 1 holding occupied, 1 released, capacity 4.
    expect(screen.getByText(/2\/4 ocupados/)).toBeTruthy();
    expect(screen.getByText(/\[1 liberado\]/)).toBeTruthy();

    fireEvent.click(screen.getByText("Liberado"));
    // Toggling the tile reveals rows elsewhere; the rollup headline is
    // unaffected because `occupied` never counted released to begin with.
    expect(screen.getByText(/2\/4 ocupados/)).toBeTruthy();
  });

  it("flattens the view when searching and shows Sesión/Horario columns", () => {
    render(<ProgramRosterView roster={roster()} />);

    fireEvent.change(screen.getByPlaceholderText(/Nombre, correo/i), {
      target: { value: "gómez" },
    });

    expect(screen.getByRole("columnheader", { name: "Sesión" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Horario" })).toBeTruthy();
    expect(screen.getByText("Ana Gómez")).toBeTruthy();
    expect(screen.queryByText("Beto Ruiz")).toBeNull();
  });

  it("search matches by purchase id and spans released rows regardless of the toggle", () => {
    render(<ProgramRosterView roster={roster()} />);

    fireEvent.change(screen.getByPlaceholderText(/Nombre, correo/i), {
      target: { value: "#101" },
    });

    // 101 belongs to the released entry, hidden everywhere else by default.
    expect(screen.getByText("Carlos Pérez")).toBeTruthy();
  });

  it("shows 'sin resultados' when a search matches nothing", () => {
    render(<ProgramRosterView roster={roster()} />);

    fireEvent.change(screen.getByPlaceholderText(/Nombre, correo/i), {
      target: { value: "nadie-existe" },
    });

    expect(screen.getByText(/Sin resultados para/)).toBeTruthy();
  });

  it("shows the no-sessions empty state", () => {
    render(<ProgramRosterView roster={roster({ sessions: [], occurrences: [], entries: [] })} />);
    expect(screen.getByText(/Todavía no hay sesiones en este programa/)).toBeTruthy();
  });

  it("shows the no-enrollments empty state when sessions exist but nobody signed up", () => {
    render(<ProgramRosterView roster={roster({ entries: [] })} />);
    expect(screen.getByText(/Todavía nadie se inscribió a este programa/)).toBeTruthy();
  });

  it("shows the empty-session state when a selected session has zero entries", () => {
    render(
      <ProgramRosterView
        roster={roster({
          entries: [entry({ lineId: 1, occurrenceId: 3, state: "confirmed" })],
        })}
      />,
    );

    fireEvent.click(screen.getByText("Taller A"));
    expect(screen.getByText(/Nadie se inscribió a esta sesión todavía/)).toBeTruthy();
  });
});
