// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FullTableReadinessList from "@/app/components/festivals/full-table-readiness";
import type { FullTableReadiness } from "@/app/lib/stands/full-table-queries";

const ready: FullTableReadiness = {
  declaredPairs: 3,
  unpricedPairs: 0,
  hasFreePair: true,
};

function renderList(
  readiness: Partial<FullTableReadiness> = {},
  flags: { creditsLaunched?: boolean; enabled?: boolean } = {},
) {
  return render(
    <FullTableReadinessList
      readiness={{ ...ready, ...readiness }}
      creditsLaunched={flags.creditsLaunched ?? true}
      enabled={flags.enabled ?? true}
    />,
  );
}

describe("FullTableReadinessList", () => {
  afterEach(cleanup);

  it("says the offer is live once every gate passes", () => {
    renderList();

    expect(screen.getByText("Los participantes ven la oferta")).toBeTruthy();
    expect(screen.queryByText("Todavía no se ofrece")).toBeNull();
  });

  /**
   * The whole point: each of these removes the banner with nothing said, so an
   * admin who enabled the feature sees no change and no reason.
   */
  it.each([
    ["credits still hidden", {}, { creditsLaunched: false }],
    ["the category switched off", {}, { enabled: false }],
    ["nothing declared", { declaredPairs: 0 }, {}],
    ["no free pair", { hasFreePair: false }, {}],
  ])("reports %s as blocking", (_label, readiness, flags) => {
    renderList(readiness, flags);

    expect(screen.getByText("Todavía no se ofrece")).toBeTruthy();
  });

  it("names unpriced tables as the thing waiting on the admin", () => {
    // Declared but unpriced is the trap: the count looks right on the stands
    // table while the offer stays hidden.
    renderList({ declaredPairs: 0, unpricedPairs: 2 });

    expect(screen.getByText(/2 mesas declaradas sin precio/i)).toBeTruthy();
  });

  it("does not claim a shortfall when the tables are merely taken", () => {
    renderList({ declaredPairs: 4, unpricedPairs: 0, hasFreePair: false });

    expect(screen.getByText(/al menos una mitad tomada/i)).toBeTruthy();
    expect(screen.getByText(/4 mesas con precio/i)).toBeTruthy();
  });

  /** The list is festival-wide; per-participant gates are not on this screen. */
  it("says the per-participant gates are not covered here", () => {
    renderList();

    expect(
      screen.getByText(/verificado, inscrito y con los términos aceptados/i),
    ).toBeTruthy();
  });
});
