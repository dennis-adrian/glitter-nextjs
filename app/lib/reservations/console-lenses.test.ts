import { describe, expect, it } from "vitest";

import {
  consoleHref,
  DEFAULT_LENS,
  lensInitialState,
  parseFocusedReservation,
  parseLens,
} from "@/app/lib/reservations/console-lenses";

function visible(lens: Parameters<typeof lensInitialState>[0]): string[] {
  const state = lensInitialState(lens);
  return Object.entries(state.columnVisibility ?? {})
    .filter(([, isVisible]) => isVisible)
    .map(([column]) => column);
}

describe("parseLens", () => {
  it("accepts the three lenses", () => {
    expect(parseLens("reservas")).toBe("reservas");
    expect(parseLens("cobros")).toBe("cobros");
    expect(parseLens("creditos")).toBe("creditos");
  });

  it("falls back to the default for anything else", () => {
    expect(parseLens(undefined)).toBe(DEFAULT_LENS);
    expect(parseLens("pagos")).toBe(DEFAULT_LENS);
    expect(parseLens("")).toBe(DEFAULT_LENS);
  });

  it("takes the first value when the query repeats the key", () => {
    expect(parseLens(["cobros", "reservas"])).toBe("cobros");
  });
});

describe("parseFocusedReservation", () => {
  it("reads a reservation id", () => {
    expect(parseFocusedReservation("88")).toBe(88);
  });

  it("ignores anything that is not a positive integer", () => {
    expect(parseFocusedReservation(undefined)).toBeNull();
    expect(parseFocusedReservation("")).toBeNull();
    expect(parseFocusedReservation("0")).toBeNull();
    expect(parseFocusedReservation("-3")).toBeNull();
    expect(parseFocusedReservation("8.5")).toBeNull();
    expect(parseFocusedReservation("abc")).toBeNull();
  });

  it("takes the first value when the query repeats the key", () => {
    expect(parseFocusedReservation(["88", "12"])).toBe(88);
  });
});

describe("consoleHref", () => {
  it("links to a lens", () => {
    expect(consoleHref({ festivalId: 619, lens: "cobros" })).toBe(
      "/dashboard/festivals/619/reservations?lens=cobros",
    );
  });

  it("focuses one reservation in a form the page reads back", () => {
    const href = consoleHref({
      festivalId: 619,
      lens: "cobros",
      reservationId: 88,
    });
    expect(href).toBe(
      "/dashboard/festivals/619/reservations?lens=cobros&reservation=88",
    );

    const query = new URL(href, "https://example.com").searchParams;
    expect(parseLens(query.get("lens") ?? undefined)).toBe("cobros");
    expect(parseFocusedReservation(query.get("reservation") ?? undefined)).toBe(
      88,
    );
  });
});

describe("lensInitialState", () => {
  it("shows the tender columns only where they answer the question", () => {
    expect(visible("cobros")).toContain("creditAmount");
    expect(visible("cobros")).toContain("outstandingAmount");
    expect(visible("cobros")).toContain("proof");
    expect(visible("reservas")).not.toContain("creditAmount");
    expect(visible("reservas")).not.toContain("proof");
  });

  it("keeps identity and coverage in every lens", () => {
    for (const lens of ["reservas", "cobros", "creditos"] as const) {
      expect(visible(lens)).toContain("id");
      expect(visible(lens)).toContain("stand");
      expect(visible(lens)).toContain("coverage");
      expect(visible(lens)).toContain("actions");
    }
  });

  it("shows who is on the stand in reservas and who owes in cobros", () => {
    expect(visible("reservas")).toContain("artists");
    expect(visible("reservas")).not.toContain("owner");
    expect(visible("cobros")).toContain("owner");
  });

  it("opens the settlement queue on rows awaiting a decision", () => {
    const filters = lensInitialState("cobros").columnFilters ?? [];
    const coverage = filters.find((filter) => filter.id === "coverage");
    expect(coverage?.value).toEqual(["under_review", "partial", "overdue"]);
  });

  it("opens créditos on the reservations its subtitle promises", () => {
    // "Reservas con créditos aplicados o extras pagados con crédito" — the
    // lens showed the festival's every reservation, so the tab was
    // indistinguishable from Cobros.
    const filters = lensInitialState("creditos").columnFilters ?? [];
    const source = filters.find((filter) => filter.id === "creditSource");
    expect(source?.value).toEqual(["invoice", "features"]);
  });

  it("drops the queue's default filters when focused on one reservation", () => {
    // An unpaid cobro whose credits are still under review is outside the
    // cobros queue's default, so a link to it would land on an empty table.
    expect(lensInitialState("cobros", { focused: true }).columnFilters).toEqual(
      [],
    );
    expect(
      lensInitialState("creditos", { focused: true }).columnFilters,
    ).toEqual([]);
    // Focus narrows rows, not columns: the lens still decides what is shown.
    expect(
      lensInitialState("cobros", { focused: true }).columnVisibility,
    ).toEqual(lensInitialState("cobros").columnVisibility);
  });

  it("leaves the reservations lens unfiltered", () => {
    expect(lensInitialState("reservas").columnFilters).toEqual([]);
  });

  it("declares every column so a preset hides rather than omits", () => {
    // A column missing from the map would default to visible and leak into
    // every lens.
    const state = lensInitialState("reservas");
    expect(Object.keys(state.columnVisibility ?? {})).toContain("proof");
    expect(state.columnVisibility?.proof).toBe(false);
  });
});
