// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/credits/actions", () => ({
  reviewCreditTopUpAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// The dialog picks its layout from a media query jsdom does not implement.
vi.mock("@/app/hooks/use-media-query", () => ({ useMediaQuery: () => true }));

import CreditTopUpReviewCard from "@/app/components/credits/admin/credit-top-up-review-card";
import { calculateCreditBalances } from "@/app/lib/credits/balances";
import type { CreditTopUpReviewItem } from "@/app/lib/credits/queries";

function item(
  overrides: Partial<CreditTopUpReviewItem> = {},
): CreditTopUpReviewItem {
  return {
    id: 7,
    amount: 50,
    status: "under_review",
    voucherUrl: "https://example.com/voucher.png",
    submittedAt: new Date("2026-09-03T12:00:00Z"),
    reviewedAt: null,
    rejectionReason: null,
    intendedUseType: "invoice",
    intendedUseId: 31,
    invoiceReservationId: 88,
    invoiceFestivalId: 619,
    user: {
      id: 11,
      displayName: "Ana",
      firstName: null,
      lastName: null,
      email: "ana@example.com",
    },
    balances: calculateCreditBalances({
      ledgerBalance: 50,
      activeHolds: 0,
      underReviewIssuance: 0,
    }),
    balanceAfterReversal: 0,
    recentSpends: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("CreditTopUpReviewCard", () => {
  it("links an invoice top-up to its reservation's cobro in the festival console", () => {
    render(<CreditTopUpReviewCard item={item()} canReview />);

    // `/dashboard/reservations/:id/payments` was never a route; the tender
    // lives in the festival console's cobros lens.
    expect(
      screen
        .getByRole("link", { name: "Ver los pagos de la reserva #88" })
        .getAttribute("href"),
    ).toBe("/dashboard/festivals/619/reservations?lens=cobros&reservation=88");
  });

  it("offers no link when the top-up does not pay a reservation", () => {
    render(
      <CreditTopUpReviewCard
        item={item({
          intendedUseType: "feature",
          intendedUseId: 3,
          invoiceReservationId: null,
          invoiceFestivalId: null,
        })}
        canReview
      />,
    );

    expect(
      screen.queryByRole("link", { name: /pagos de la reserva/ }),
    ).toBeNull();
  });

  it("offers no link when the reservation's festival is unknown", () => {
    render(
      <CreditTopUpReviewCard
        item={item({ invoiceFestivalId: null })}
        canReview
      />,
    );

    expect(
      screen.queryByRole("link", { name: /pagos de la reserva/ }),
    ).toBeNull();
  });
});
