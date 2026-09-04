// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/credits/purchase-actions", () => ({
  createDebtCreditTopUpAction: vi.fn(),
}));
vi.mock("@/app/lib/reservations/full-table-actions", () => ({
  deactivateFullTableAccessAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import CreditBalanceSummary from "@/app/components/credits/credit-balance-summary";
import { calculateCreditBalances } from "@/app/lib/credits/balances";
import type { FeatureHold } from "@/app/lib/credits/queries";

const hold: FeatureHold = {
  featureActionId: 1,
  festivalId: 619,
  festivalName: "Glitter ¡Feliz Cumple!",
  amount: 20,
  status: "active",
  reservedAt: new Date("2026-09-04T10:00:00Z"),
  closedAt: null,
};

function renderSummary(
  input: {
    ledgerBalance: number;
    activeHolds?: number;
    underReviewIssuance?: number;
  },
  holds: FeatureHold[] = [],
) {
  return render(
    <CreditBalanceSummary
      balances={calculateCreditBalances({
        ledgerBalance: input.ledgerBalance,
        activeHolds: input.activeHolds ?? 0,
        underReviewIssuance: input.underReviewIssuance ?? 0,
      })}
      activeHolds={holds}
    />,
  );
}

/** The headline figure, read through its own label so it is unambiguous. */
function availableText() {
  return screen.getByText("Disponibles para usar ahora").previousSibling
    ?.textContent;
}

describe("CreditBalanceSummary", () => {
  afterEach(cleanup);

  it("counts credits rather than pricing them", () => {
    renderSummary({ ledgerBalance: 20 });

    expect(availableText()).toBe("20 créditos");
    expect(screen.queryByText(/Bs/)).toBeNull();
  });

  /**
   * The state a rejected voucher leaves: the ledger is back to zero but the
   * hold outlives the credits behind it, so the raw spendable balance is -20.
   * Showing that told someone holding an unused reservation they were in the
   * red for credits they never spent.
   */
  it("does not report a reservation as a negative balance", () => {
    renderSummary({ ledgerBalance: 0, activeHolds: 20 }, [hold]);

    expect(availableText()).toBe("0 créditos");
    expect(screen.queryByText("-20 créditos")).toBeNull();
    expect(screen.queryByText("Tenés un saldo pendiente")).toBeNull();
  });

  /**
   * Releasing this hold returns nothing — the credits behind it were reversed
   * — and using it is what would create the debt. Promising the credits back
   * would be the same lie the raw balance told, in the other direction.
   */
  it("does not promise credits back from a reservation that lost them", () => {
    renderSummary({ ledgerBalance: 0, activeHolds: 20 }, [hold]);

    expect(screen.getByText(/tu saldo se restablecerá/)).toBeTruthy();
    expect(screen.getByText(/vas a quedar debiendo 20 créditos/)).toBeTruthy();
    expect(screen.queryByText(/volvés a tenerlos disponibles/)).toBeNull();
  });

  it("offers to hand reserved credits back", () => {
    renderSummary({ ledgerBalance: 20, activeHolds: 20 }, [hold]);

    expect(
      screen.getByRole("button", {
        name: /Liberar 20 créditos de Glitter/,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/volvés a tenerlos disponibles/)).toBeTruthy();
  });

  it("says nothing about releasing when nothing is reserved", () => {
    renderSummary({ ledgerBalance: 20 });

    expect(screen.queryByText(/Liberar/)).toBeNull();
    expect(screen.queryByText(/Reservados para una función/)).toBeNull();
  });

  /** A negative ledger is the only real debt, and it keeps its own alert. */
  it("still calls an actual debt a debt", () => {
    renderSummary({ ledgerBalance: -15 });

    expect(screen.getByText("Tenés un saldo pendiente")).toBeTruthy();
    expect(screen.getByText(/quedaste debiendo 15 créditos/)).toBeTruthy();
  });
});
