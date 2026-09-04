// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The purchase button reaches a "use server" module that imports `server-only`,
// which throws outside a server build.
vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/credits/purchase-actions", () => ({
  createFeatureCreditTopUpAction: vi.fn(),
}));
vi.mock("@/app/lib/reservations/full-table-actions", () => ({
  activateFullTableAccessAction: vi.fn(),
  deactivateFullTableAccessAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import FullTablePanel from "@/app/components/festivals/reservations/full-table-panel";

import type { FullTableOffer } from "@/app/lib/reservations/full-table-queries";

function offer(overrides: Partial<FullTableOffer> = {}): FullTableOffer {
  return {
    offered: true,
    active: false,
    creditPrice: 90,
    spendableBalance: 0,
    shortfall: 90,
    hasCompleteTable: true,
    blockedReason: "insufficient_credits",
    ...overrides,
  };
}

function renderPanel(
  data: FullTableOffer,
  { creditsEnabled = true }: { creditsEnabled?: boolean } = {},
) {
  return render(
    <FullTablePanel
      offer={data}
      festivalId={1}
      creditsEnabled={creditsEnabled}
    />,
  );
}

const BUY = /Comprar \d+ créditos?/;

describe("FullTablePanel", () => {
  afterEach(cleanup);

  it("offers the purchase when credits are the only thing missing", () => {
    renderPanel(offer());

    expect(screen.getByText("Mesa completa")).toBeTruthy();
    expect(screen.getByText(BUY)).toBeTruthy();
  });

  /**
   * `fetchFullTableOffer` withholds the offer entirely once no pair has both
   * halves free, so the panel never has to word a "sold out for now" state.
   * The one exception is somebody who already activated: their credits are
   * held, and the way to release them is on this panel.
   */
  it("keeps the release path for a holder with no free table left", () => {
    renderPanel(offer({ active: true, hasCompleteTable: false, shortfall: 0 }));

    expect(screen.getByRole("button", { name: "Desactivar" })).toBeTruthy();
    expect(screen.queryByText(BUY)).toBeNull();
  });

  it("drops the purchase once the balance covers the price", () => {
    renderPanel(
      offer({ spendableBalance: 120, shortfall: 0, blockedReason: null }),
    );

    expect(screen.queryByText(BUY)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Activar" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  /**
   * A full table is only ever paid for in credits. Rendering the panel with the
   * flag still hidden quoted a price with no route to paying it — the feature
   * looked enabled and was unusable.
   */
  it("renders nothing while credits are still hidden from participants", () => {
    const { container } = renderPanel(offer(), { creditsEnabled: false });

    expect(container.innerHTML).toBe("");
  });

  /**
   * A festival that priced the feature but never paired any stands has no
   * inventory, which `fetchFullTableOffer` reports as `offered: false` rather
   * than as a table that might free up later.
   */
  it("renders nothing when the festival has no full tables to sell", () => {
    const { container } = renderPanel(offer({ offered: false }));

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the festival does not offer the feature", () => {
    const { container } = renderPanel(offer({ offered: false }));

    expect(container.innerHTML).toBe("");
  });
});
