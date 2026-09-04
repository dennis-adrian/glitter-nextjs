// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The debt purchase button reaches a "use server" module that imports
// `server-only`, which throws outside a server build.
vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/credits/purchase-actions", () => ({
  createDebtCreditTopUpAction: vi.fn(),
}));
// The release control on the balance card reaches another one.
vi.mock("@/app/lib/reservations/full-table-actions", () => ({
  deactivateFullTableAccessAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import CreditWallet from "@/app/components/credits/credit-wallet";
import { calculateCreditBalances } from "@/app/lib/credits/balances";
import type {
  CreditWallet as CreditWalletData,
  CreditWalletEntry,
  CreditWalletTopUp,
  FeatureHold,
} from "@/app/lib/credits/queries";

const now = new Date("2026-09-03T12:00:00Z");

function topUp(overrides: Partial<CreditWalletTopUp> = {}): CreditWalletTopUp {
  return {
    id: 7,
    amount: 20,
    status: "awaiting_voucher",
    intendedUseType: "feature",
    intendedUseId: 3,
    uploadDeadlineAt: new Date(now.getTime() + 10 * 60_000),
    submittedAt: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: now,
    invoiceReservationId: null,
    invoiceFestivalId: null,
    ...overrides,
  };
}

function entry(overrides: Partial<CreditWalletEntry> = {}): CreditWalletEntry {
  return {
    id: 1,
    amount: 20,
    type: "top_up",
    topUpId: 7,
    featureActionId: null,
    invoiceId: null,
    reason: null,
    createdAt: now,
    reversesEntryId: null,
    isReverted: false,
    ...overrides,
  };
}

function hold(overrides: Partial<FeatureHold> = {}): FeatureHold {
  return {
    featureActionId: 1,
    festivalId: 619,
    festivalName: "Glitter ¡Feliz Cumple!",
    amount: 20,
    status: "active",
    reservedAt: new Date(now.getTime() - 60_000),
    closedAt: null,
    ...overrides,
  };
}

function wallet(overrides: Partial<CreditWalletData> = {}): CreditWalletData {
  return {
    balances: calculateCreditBalances({
      ledgerBalance: 0,
      activeHolds: 0,
      underReviewIssuance: 0,
    }),
    topUps: [],
    entries: [],
    ...overrides,
  };
}

describe("CreditWallet", () => {
  afterEach(cleanup);

  /**
   * Paying used to happen here, which put a ten-minute countdown in the middle
   * of a page people open to read their balance. The wallet now only points at
   * the purchase; finishing it happens on the purchase's own page.
   */
  it("shows an unpaid purchase as a link out, not a form", () => {
    render(
      <CreditWallet wallet={wallet({ topUps: [topUp()] })} profileId={42} />,
    );

    expect(
      screen
        .getByRole("link", { name: /Compra de créditos en curso/ })
        .getAttribute("href"),
    ).toBe("/my_credits/7");
    expect(screen.queryByText("Subir comprobante")).toBeNull();
  });

  it("drops a purchase out of the movements once its voucher is in", () => {
    // Submitting the voucher issues the credits, so from then on the ledger
    // entry is the movement; repeating the purchase above it would double it.
    render(
      <CreditWallet
        wallet={wallet({
          topUps: [topUp({ status: "under_review" })],
          entries: [entry()],
        })}
        profileId={42}
      />,
    );

    expect(screen.queryByText(/Compra de créditos en curso/)).toBeNull();
    expect(screen.getByText("Compras anteriores")).toBeTruthy();
  });

  it("still reports an empty wallet as empty", () => {
    render(<CreditWallet wallet={wallet()} profileId={42} />);

    expect(screen.getByText("Todavía no tenés movimientos")).toBeTruthy();
  });

  /**
   * An earmark posts no ledger entry, so without a row here the movements
   * cannot account for the balance they sit under — the wallet looks like it
   * lost track of 20 credits.
   */
  it("accounts for earmarked credits in the movements", () => {
    render(<CreditWallet wallet={wallet()} profileId={42} holds={[hold()]} />);

    expect(
      screen.getByText("Créditos reservados para la mesa completa"),
    ).toBeTruthy();
    expect(screen.getByText("-20 créditos")).toBeTruthy();
    // Reserved, not charged (PRD §7.3).
    expect(screen.getByText(/Todavía no se descontaron/)).toBeTruthy();
    expect(screen.queryByText("Todavía no tenés movimientos")).toBeNull();
  });

  /**
   * Releasing used to take the whole episode out of the history, leaving an
   * unexplained dip. Both ends of it are now permanent.
   */
  it("keeps both ends of a released reservation in the history", () => {
    render(
      <CreditWallet
        wallet={wallet()}
        profileId={42}
        holds={[
          hold({
            status: "released",
            closedAt: new Date(now.getTime() - 30_000),
          }),
        ]}
      />,
    );

    expect(
      screen.getByText("Créditos reservados para la mesa completa"),
    ).toBeTruthy();
    expect(screen.getByText("Reserva de créditos liberada")).toBeTruthy();
    expect(screen.getByText("-20 créditos")).toBeTruthy();
    expect(screen.getByText("+20 créditos")).toBeTruthy();
  });

  /** Capture posts a `spend`; a second row would double-count it. */
  it("leaves a captured reservation to its ledger entry", () => {
    render(
      <CreditWallet
        wallet={wallet()}
        profileId={42}
        holds={[
          hold({
            status: "captured",
            closedAt: new Date(now.getTime() - 30_000),
          }),
        ]}
      />,
    );

    expect(
      screen.getByText("Créditos reservados para la mesa completa"),
    ).toBeTruthy();
    expect(screen.queryByText("Reserva de créditos liberada")).toBeNull();
    expect(screen.queryByText("+20 créditos")).toBeNull();
  });
});
