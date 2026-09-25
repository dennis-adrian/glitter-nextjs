// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fetchCreditLedgerMock = vi.hoisted(() => vi.fn());
const currentProfileMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/credits/admin-queries", () => ({
  fetchCreditLedger: fetchCreditLedgerMock,
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));
// The revert button reaches a "use server" module.
vi.mock("@/app/lib/credits/actions", () => ({
  adjustCreditAccountAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import CreditLedgerTable from "@/app/components/credits/admin/credit-ledger-table";
import {
  CreditLedgerSearchParamsSchema,
  type CreditLedgerKind,
} from "@/app/lib/credits/admin-definitions";
import type { CreditLedgerRow } from "@/app/lib/credits/admin-queries";

const params = CreditLedgerSearchParamsSchema.parse({});

function row(
  id: number,
  kind: CreditLedgerKind,
  amount: number,
  overrides: Partial<CreditLedgerRow> = {},
): CreditLedgerRow {
  return {
    id,
    createdAt: new Date("2026-09-20T15:00:00Z"),
    amount,
    kind,
    reason: null,
    user: {
      id: 8,
      displayName: "Ana",
      firstName: null,
      lastName: null,
      email: "ana@example.com",
    },
    topUp: null,
    invoice: null,
    featureAction: null,
    festival: null,
    standChangeReservationId: null,
    resolution: null,
    reversesEntryId: null,
    isReverted: false,
    actor: null,
    ...overrides,
  };
}

const rows: CreditLedgerRow[] = [
  row(1, "purchase", 100, {
    topUp: { id: 3, status: "approved", voucherUrl: "https://files/v.png" },
  }),
  row(2, "spend", -40, {
    invoice: { id: 9, reservationId: 21 },
    festival: { id: 5, name: "Festicker" },
    isReverted: true,
  }),
  row(3, "refund", 40, {
    invoice: { id: 9, reservationId: 21 },
    reversesEntryId: 2,
  }),
  row(4, "grant", 20, {
    reason: "compensación",
    actor: { id: 1, name: "Admin Uno" },
  }),
  row(5, "deduction", -5, { isReverted: true }),
  row(6, "debt_resolution", 5, {
    resolution: "waive",
    actor: { id: 1, name: "Admin Uno" },
  }),
  row(7, "spend", -30, {
    featureAction: { id: 11, type: "late_partner", reservationId: 21 },
  }),
];

function entryItem(id: number) {
  return screen.getByText(`#${id}`).closest("li")!;
}

describe("CreditLedgerTable", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchCreditLedgerMock.mockResolvedValue({
      rows,
      total: rows.length,
      creditsIn: 165,
      creditsOut: -75,
    });
    consoleError = vi.spyOn(console, "error");
  });
  afterEach(() => {
    // React reports invalid nesting (a badge's <div> inside a <p>) only as a
    // console error, and in the browser it breaks hydration of the page.
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    cleanup();
    vi.clearAllMocks();
  });

  it("says what each entry touched", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    render(await CreditLedgerTable({ params }));

    expect(
      within(entryItem(1))
        .getByRole("link", { name: "ver comprobante" })
        .getAttribute("href"),
    ).toBe("https://files/v.png");
    expect(within(entryItem(1)).getByText("Aprobada")).toBeTruthy();

    expect(within(entryItem(2)).getByText("Devuelto")).toBeTruthy();
    expect(
      within(entryItem(2))
        .getByRole("link", { name: "reserva #21" })
        .getAttribute("href"),
    ).toBe("/dashboard/reservations/21/edit");
    expect(
      within(entryItem(2))
        .getByRole("link", { name: "Festicker" })
        .getAttribute("href"),
    ).toBe("/dashboard/festivals/5");

    expect(
      within(entryItem(3)).getByText(/Devuelto del cobro #9/),
    ).toBeTruthy();
    expect(within(entryItem(4)).getByText("compensación")).toBeTruthy();
    expect(within(entryItem(4)).getByText("Por Admin Uno")).toBeTruthy();
    expect(within(entryItem(5)).getByText("Revertido")).toBeTruthy();
    expect(within(entryItem(6)).getByText("Condonado")).toBeTruthy();
    expect(within(entryItem(7)).getByText(/Compañero agregado/)).toBeTruthy();
  });

  /**
   * Only an admin's own, still-standing decision is undoable. A refund looks
   * like an admin adjustment in the ledger but taking it back would strand
   * the participant's credits.
   */
  it("offers a revert only on admin decisions that still stand", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    render(await CreditLedgerTable({ params }));

    const withRevert = [1, 2, 3, 4, 5, 6, 7].filter(
      (id) =>
        within(entryItem(id)).queryByRole("button", { name: /Revertir/ }) !=
        null,
    );
    expect(withRevert).toEqual([4, 6]);
  });

  it("shows no revert control to a festival admin", async () => {
    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });
    render(await CreditLedgerTable({ params }));

    expect(screen.queryAllByRole("button", { name: /Revertir/ })).toHaveLength(
      0,
    );
  });

  it("links each entry to its participant unless the page is one account", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const { unmount } = render(await CreditLedgerTable({ params }));
    expect(
      within(entryItem(4))
        .getByRole("link", { name: /Ana/ })
        .getAttribute("href"),
    ).toBe("/dashboard/credits/accounts/8");
    unmount();

    render(await CreditLedgerTable({ params, showUser: false }));
    expect(
      within(entryItem(4)).queryByRole("link", { name: /Ana/ }),
    ).toBeNull();
  });

  it("totals what the filter matched", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    render(await CreditLedgerTable({ params }));

    expect(
      screen.getByText(/7 movimientos/).textContent?.replace(/\s+/g, " "),
    ).toBe(
      "7 movimientos · entradas +Bs165.00 · salidas -Bs75.00 · neto +Bs90.00",
    );
  });

  it("says so when nothing matches", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    fetchCreditLedgerMock.mockResolvedValue({
      rows: [],
      total: 0,
      creditsIn: 0,
      creditsOut: 0,
    });
    render(await CreditLedgerTable({ params }));

    expect(
      screen.getByText("Ningún movimiento coincide con el filtro"),
    ).toBeTruthy();
  });
});
