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

const BUY = /Comprar .* en créditos/;

describe("FullTablePanel", () => {
  afterEach(cleanup);

  it("offers the purchase when credits are the only thing missing", () => {
    renderPanel(offer());

    expect(screen.getByRole("heading", { name: "Mesa completa" })).toBeTruthy();
    expect(screen.getByText(BUY)).toBeTruthy();
  });

  /**
   * The server sells in this state on purpose: credits never expire and pay the
   * participant's own reservation if no table ever frees up. Hiding the button
   * here stranded anyone who wanted to be ready for one.
   */
  it("still offers the purchase when no table has both halves free", () => {
    renderPanel(
      offer({ hasCompleteTable: false, blockedReason: "no_complete_table" }),
    );

    expect(screen.getByText(BUY)).toBeTruthy();
    // Activation stays refused — buying credits is not taking a table.
    expect(
      screen
        .getByRole("button", { name: "Activar mesa completa" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("drops the purchase once the balance covers the price", () => {
    renderPanel(
      offer({ spendableBalance: 120, shortfall: 0, blockedReason: null }),
    );

    expect(screen.queryByText(BUY)).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Activar mesa completa" })
        .hasAttribute("disabled"),
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

  it("renders nothing when the festival does not offer the feature", () => {
    const { container } = renderPanel(offer({ offered: false }));

    expect(container.innerHTML).toBe("");
  });
});
