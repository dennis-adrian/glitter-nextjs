import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import OccurrenceRosterTable from "@/app/components/dashboard/programs/occurrence-roster-table";
import OccurrenceSeatSummary from "@/app/components/dashboard/programs/occurrence-seat-summary";
import type {
  OccurrenceRosterSummary,
  RosterEntry,
} from "@/app/lib/programs/occurrence-queries";
import { summarizeRoster } from "@/app/lib/programs/roster";

afterEach(cleanup);

function entry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    lineId: 1,
    purchaseId: 100,
    state: "confirmed",
    attendeeName: "Ana Quiroga",
    attendeeEmail: "ana@example.com",
    attendeePhone: null,
    isGuest: false,
    ticketCode: "ABC123",
    unitPrice: 70,
    isFree: false,
    holdExpiresAt: null,
    createdAt: new Date("2026-07-30T15:00:00.000Z"),
    ...overrides,
  };
}

/**
 * These shapes mirror what the probe returned from the dev database, so the
 * table is exercised against the same rows an admin will actually see.
 */
describe("OccurrenceRosterTable", () => {
  it("says so plainly when nobody has signed up", () => {
    render(<OccurrenceRosterTable entries={[]} />);
    expect(screen.getByText(/todavía nadie se inscribió/i)).toBeTruthy();
  });

  it("renders a confirmed attendee with their ticket and price", () => {
    render(<OccurrenceRosterTable entries={[entry()]} />);

    expect(screen.getByText("Ana Quiroga")).toBeTruthy();
    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(screen.getByText("ABC123")).toBeTruthy();
    expect(screen.getByText("Confirmado")).toBeTruthy();
    expect(screen.getByText("Con cuenta")).toBeTruthy();
    // Localized, not a bare number.
    expect(screen.getByText("Bs 70,00")).toBeTruthy();
  });

  it("marks a guest and shows the phone only they provide", () => {
    render(
      <OccurrenceRosterTable
        entries={[
          entry({
            isGuest: true,
            attendeePhone: "+59171234567",
            ticketCode: null,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Invitado")).toBeTruthy();
    expect(screen.getByText("+59171234567")).toBeTruthy();
    expect(screen.getByText("Sin emitir")).toBeTruthy();
  });

  it("shows a free registration as free rather than Bs 0", () => {
    render(
      <OccurrenceRosterTable
        entries={[entry({ isFree: true, unitPrice: 0 })]}
      />,
    );
    expect(screen.getByText("Gratis")).toBeTruthy();
    expect(screen.queryByText(/Bs 0/)).toBeNull();
  });

  it("shows the deadline only while a hold is running", () => {
    const { rerender } = render(
      <OccurrenceRosterTable
        entries={[
          entry({
            state: "holding",
            ticketCode: null,
            holdExpiresAt: new Date("2026-07-30T15:20:00.000Z"),
          }),
        ]}
      />,
    );
    expect(screen.getByText(/vence/i)).toBeTruthy();

    // A lapsed hold arrives already resolved to `released`; no clock then.
    rerender(
      <OccurrenceRosterTable
        entries={[
          entry({
            state: "released",
            ticketCode: null,
            holdExpiresAt: new Date("2026-07-30T14:00:00.000Z"),
          }),
        ]}
      />,
    );
    expect(screen.queryByText(/vence/i)).toBeNull();
    expect(screen.getByText("Liberado")).toBeTruthy();
  });

  it("keeps released rows rather than hiding the drop-off", () => {
    render(
      <OccurrenceRosterTable
        entries={[
          entry({ lineId: 1, attendeeName: "Confirmada" }),
          entry({
            lineId: 2,
            state: "released",
            attendeeName: "Abandonó",
            ticketCode: null,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Confirmada")).toBeTruthy();
    expect(screen.getByText("Abandonó")).toBeTruthy();
  });

  it("does not link the buyer's purchase page, which admins cannot open", () => {
    // `resolvePurchaseAccess` grants only the owner or a valid token.
    const { container } = render(
      <OccurrenceRosterTable entries={[entry({ purchaseId: 42 })]} />,
    );

    expect(screen.getByText("#42")).toBeTruthy();
    expect(
      container.querySelector('a[href*="/programs/purchases/"]'),
    ).toBeNull();
  });
});

function summary(
  overrides: Partial<OccurrenceRosterSummary> = {},
): OccurrenceRosterSummary {
  return {
    occurrenceId: 71,
    capacity: 20,
    totals: summarizeRoster(["confirmed", "awaiting_review"]),
    remaining: 18,
    isSoldOut: false,
    waitlistActive: 0,
    ...overrides,
  };
}

describe("OccurrenceSeatSummary", () => {
  it("leads with what is left, not with the configured capacity", () => {
    render(<OccurrenceSeatSummary summary={summary()} />);
    expect(screen.getByText("18 de 20 disponibles")).toBeTruthy();
    expect(screen.getByText("1 confirmado")).toBeTruthy();
    expect(screen.getByText("1 pendientes de revisión")).toBeTruthy();
  });

  it("inflects the confirmed count", () => {
    const { rerender } = render(<OccurrenceSeatSummary summary={summary()} />);
    expect(screen.getByText("1 confirmado")).toBeTruthy();

    rerender(
      <OccurrenceSeatSummary
        summary={summary({
          totals: summarizeRoster(["confirmed", "confirmed"]),
          remaining: 18,
        })}
      />,
    );
    expect(screen.getByText("2 confirmados")).toBeTruthy();
  });

  it("hides counts that are zero so the row stays readable", () => {
    render(
      <OccurrenceSeatSummary
        summary={summary({ totals: summarizeRoster([]), remaining: 20 })}
      />,
    );

    expect(screen.getByText("20 de 20 disponibles")).toBeTruthy();
    expect(screen.queryByText(/confirmado/)).toBeNull();
    expect(screen.queryByText(/pendientes de revisión/)).toBeNull();
    expect(screen.queryByText(/en espera/)).toBeNull();
  });

  it("flags a sold-out occurrence and its waiting list", () => {
    render(
      <OccurrenceSeatSummary
        summary={summary({
          totals: summarizeRoster(Array(20).fill("confirmed")),
          remaining: 0,
          isSoldOut: true,
          waitlistActive: 3,
        })}
      />,
    );

    expect(screen.getByText("0 de 20 disponibles")).toBeTruthy();
    expect(screen.getByText("3 en espera")).toBeTruthy();
  });

  it("links to the roster only when given a destination", () => {
    const { container, rerender } = render(
      <OccurrenceSeatSummary summary={summary()} />,
    );
    expect(screen.queryByText("Ver inscritos")).toBeNull();

    rerender(
      <OccurrenceSeatSummary
        summary={summary()}
        href="/dashboard/programs/occurrences/71"
      />,
    );
    const link = within(container).getByText("Ver inscritos");
    expect(link.closest("a")?.getAttribute("href")).toBe(
      "/dashboard/programs/occurrences/71",
    );
  });
});
