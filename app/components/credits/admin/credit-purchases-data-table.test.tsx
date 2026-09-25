// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/credits/actions", () => ({
  reviewCreditTopUpAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dashboard/credits/reviews",
  useSearchParams: () => new URLSearchParams(),
}));
// The dialog picks its layout from a media query jsdom does not implement.
vi.mock("@/app/hooks/use-media-query", () => ({ useMediaQuery: () => true }));

import CreditPurchasesDataTable from "@/app/components/credits/admin/credit-purchases-data-table";
import type { CreditPurchaseRow } from "@/app/lib/credits/admin-queries";

function purchase(
  overrides: Partial<CreditPurchaseRow> = {},
): CreditPurchaseRow {
  return {
    id: 7,
    amount: 50,
    status: "under_review",
    intendedUseType: "invoice",
    featureType: null,
    voucherUrl: "https://example.com/voucher.png",
    createdAt: new Date("2026-09-03T11:55:00Z"),
    submittedAt: new Date("2026-09-03T12:00:00Z"),
    uploadDeadlineAt: new Date("2026-09-03T12:05:00Z"),
    reviewedAt: null,
    reviewerName: null,
    rejectionReason: null,
    user: {
      id: 11,
      displayName: "Ana",
      firstName: null,
      lastName: null,
      email: "ana@example.com",
    },
    festival: { id: 619, name: "Festicker" },
    invoice: { id: 31, reservationId: 88 },
    review: {
      ledgerBalance: 50,
      balanceAfterReversal: -20,
      spentSinceSubmission: 70,
    },
    ...overrides,
  };
}

function renderTable(rows: CreditPurchaseRow[], status = "under_review") {
  return render(
    <CreditPurchasesDataTable
      rows={rows}
      rowCount={rows.length}
      totalAmount={rows.reduce((total, row) => total + row.amount, 0)}
      status={status as "under_review"}
      festivals={[{ id: 619, name: "Festicker" }]}
      canReview
      now={new Date("2026-09-03T12:30:00Z")}
    />,
  );
}

function table() {
  return within(screen.getByRole("table"));
}

describe("CreditPurchasesDataTable", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error");
  });
  afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    cleanup();
  });

  it("links an invoice purchase to its reservation's cobro in the festival console", () => {
    renderTable([purchase()]);

    // `/dashboard/reservations/:id/payments` was never a route; the tender
    // lives in the festival console's cobros lens.
    expect(
      table()
        .getByRole("link", { name: "Ver los pagos de la reserva #88" })
        .getAttribute("href"),
    ).toBe("/dashboard/festivals/619/reservations?lens=cobros&reservation=88");
  });

  it("offers no cobro link when the purchase does not pay a reservation", () => {
    renderTable([
      purchase({
        intendedUseType: "feature",
        featureType: "late_partner",
        invoice: null,
      }),
    ]);

    expect(
      table().queryByRole("link", { name: /pagos de la reserva/ }),
    ).toBeNull();
    expect(table().getByText(/Compañero agregado/)).toBeTruthy();
  });

  it("offers no cobro link when the reservation's festival is unknown", () => {
    renderTable([purchase({ festival: null })]);

    expect(
      table().queryByRole("link", { name: /pagos de la reserva/ }),
    ).toBeNull();
  });

  /**
   * What a rejection would cost used to be visible only inside the review
   * dialog; it is what an admin needs to see before choosing which voucher
   * to open.
   */
  it("says what rejecting a pending voucher would leave behind", () => {
    renderTable([purchase()]);

    expect(
      table()
        .getByText(/Ya usó/)
        .textContent?.replace(/\s+/g, " "),
    ).toBe("Ya usó Bs70.00 desde el envío");
    expect(table().getByText(/Si se rechaza, queda en/).textContent).toContain(
      "-Bs20.00",
    );
  });

  it("counts a pending voucher's wait up to when the page was rendered", () => {
    renderTable([purchase()]);

    // The server's clock, not the browser's: the two render the same text,
    // so hydration keeps the server's markup.
    expect(table().getByText(/^Espera/).textContent).toBe(
      "Espera desde hace 30 minutos",
    );
  });

  it("offers a review only for a voucher still waiting on one", () => {
    renderTable(
      [
        purchase(),
        purchase({
          id: 8,
          status: "approved",
          review: null,
          reviewedAt: new Date("2026-09-04T12:00:00Z"),
          reviewerName: "Admin Uno",
        }),
        purchase({
          id: 9,
          status: "rejected",
          review: null,
          reviewedAt: new Date("2026-09-04T12:00:00Z"),
          reviewerName: "Admin Uno",
          rejectionReason: "El monto no coincide",
        }),
      ],
      "all",
    );

    expect(table().getAllByRole("button", { name: "Revisar" })).toHaveLength(1);
    expect(table().getByText("Motivo: El monto no coincide")).toBeTruthy();
    expect(table().getAllByRole("link", { name: "Comprobante" })).toHaveLength(
      2,
    );
  });
});
