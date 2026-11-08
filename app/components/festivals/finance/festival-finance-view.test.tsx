// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FestivalFinanceView, {
  FinanceEmptyState,
} from "@/app/components/festivals/finance/festival-finance-view";
import type { FestivalFinance } from "@/app/lib/festivals/finance/queries";
import type { FestivalFinanceSummary } from "@/app/lib/festivals/finance/summary";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/lib/festivals/finance/actions", () => ({
  updateCreditLeadDays: vi.fn(async () => ({ success: true })),
}));

const summary: FestivalFinanceSummary = {
  reservations: 86,
  gross: 31200,
  discounts: 1840,
  writeOffs: 300,
  writeOffReservations: 2,
  net: 29060,
  invoiceCollected: 25410,
  inactiveCollected: 0,
  outstanding: 3650,
  directPayment: 16230,
  invoiceCredits: 9180,
  featureCredits: 2050,
  credits: { festival: 7000, earlier: 2660, gifted: 1150, inReview: 420, unpaid: 0 },
  creditsTotal: 11230,
  collected: 27460,
  newMoney: 23230,
  inReviewPurchases: 2,
  extras: [{ type: "full_table_access", count: 7, amount: 1400 }],
  discountRows: [{ code: "FESTI20", label: "20%", uses: 12, amount: 1120 }],
  pending: [{ key: "inReview", reservations: 4, amount: 1120 }],
  free: { count: 4, value: 1200 },
  movable: [{ amount: 590, purchasedAt: "2026-09-27T12:00:00.000Z" }],
  fixedFestivalCredits: 0,
};

const finance: FestivalFinance = {
  festival: { id: 3, name: "Festicker 2026", reservationsStartDate: new Date("2026-10-06T14:00:00Z") },
  leadDays: 5,
  leadDaysCustom: false,
  windowStart: new Date("2026-10-01T04:00:00Z"),
  summary,
  rows: [],
};

describe("FestivalFinanceView", () => {
  afterEach(cleanup);

  it("shows the headline figures in bolivianos", () => {
    render(<FestivalFinanceView finance={finance} />);
    expect(screen.getAllByText("Bs27.460").length).toBeGreaterThan(0);
    expect(screen.getByText("Dinero nuevo")).toBeTruthy();
    expect(screen.getByText("Bs23.230")).toBeTruthy();
  });

  it("splits credits into this edition's, earlier, gifted and in review", () => {
    render(<FestivalFinanceView finance={finance} />);
    expect(screen.getByText("Créditos de esta edición")).toBeTruthy();
    expect(screen.getByText("comprados desde el 1 de octubre o para este festival", { exact: false })).toBeTruthy();
    expect(screen.getByText("Créditos anteriores")).toBeTruthy();
    expect(screen.getByText("Créditos regalados")).toBeTruthy();
    expect(screen.getByText("Créditos con compra en revisión")).toBeTruthy();
    // Nothing unpaid, so that line stays out.
    expect(screen.queryByText("Créditos sin pagar")).toBeNull();
    expect(screen.getByRole("link", { name: "Revisar compras" }).getAttribute("href")).toBe(
      "/dashboard/credits/reviews",
    );
  });

  it("never says factura", () => {
    const { container } = render(<FestivalFinanceView finance={finance} />);
    expect(container.textContent).not.toMatch(/factur/i);
  });

  it("previews a different lead before saving it", () => {
    render(<FestivalFinanceView finance={finance} />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Días antes de abrir las reservas"), {
      target: { value: "10" },
    });
    expect(within(dialog).getByText("26 de septiembre")).toBeTruthy();
    expect(within(dialog).getByText("Bs590")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(false);

    fireEvent.change(within(dialog).getByLabelText("Días antes de abrir las reservas"), {
      target: { value: "45" },
    });
    expect(within(dialog).getByText("Escribí un número entero entre 0 y 30.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(true);
  });

  it("explains an empty festival with its opening date", () => {
    render(<FinanceEmptyState finance={finance} />);
    expect(screen.getByText("Todavía no hay cobros")).toBeTruthy();
    expect(screen.getByText("Las reservas abren el 6 de octubre.", { exact: false })).toBeTruthy();
  });
});
