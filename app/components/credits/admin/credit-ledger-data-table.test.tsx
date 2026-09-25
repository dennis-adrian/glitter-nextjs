// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The revert button reaches a "use server" module.
vi.mock("@/app/lib/credits/actions", () => ({
  adjustCreditAccountAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dashboard/credits/ledger",
  useSearchParams: () => new URLSearchParams(),
}));

import CreditLedgerDataTable from "@/app/components/credits/admin/credit-ledger-data-table";
import type { CreditLedgerKind } from "@/app/lib/credits/admin-definitions";
import type { CreditLedgerRow } from "@/app/lib/credits/admin-queries";

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

function renderTable(
  props: Partial<Parameters<typeof CreditLedgerDataTable>[0]> = {},
) {
  return render(
    <CreditLedgerDataTable
      rows={rows}
      rowCount={rows.length}
      totals={{ creditsIn: 165, creditsOut: -75 }}
      festivals={[{ id: 5, name: "Festicker" }]}
      canAdjust
      {...props}
    />,
  );
}

/** The desktop table's row for an entry; the phone list repeats it. */
function entryRow(id: number) {
  return within(screen.getByRole("table")).getByText(`#${id}`).closest("tr")!;
}

describe("CreditLedgerDataTable", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error");
  });
  afterEach(() => {
    // React reports invalid nesting (a badge's <div> inside a <p>) only as a
    // console error, and in the browser it breaks hydration of the page.
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    cleanup();
  });

  it("says what each entry touched", () => {
    renderTable();

    expect(
      within(entryRow(1))
        .getByRole("link", { name: "ver comprobante" })
        .getAttribute("href"),
    ).toBe("https://files/v.png");
    expect(within(entryRow(1)).getByText("Aprobada")).toBeTruthy();

    expect(within(entryRow(2)).getByText("Devuelto")).toBeTruthy();
    expect(
      within(entryRow(2))
        .getByRole("link", { name: "reserva #21" })
        .getAttribute("href"),
    ).toBe("/dashboard/reservations/21/edit");
    expect(
      within(entryRow(2))
        .getByRole("link", { name: "Festicker" })
        .getAttribute("href"),
    ).toBe("/dashboard/festivals/5");

    expect(within(entryRow(3)).getByText(/Devuelto del cobro #9/)).toBeTruthy();
    expect(within(entryRow(4)).getByText("compensación")).toBeTruthy();
    expect(within(entryRow(4)).getByText("Por Admin Uno")).toBeTruthy();
    expect(within(entryRow(5)).getByText("Revertido")).toBeTruthy();
    expect(within(entryRow(6)).getByText("Condonado")).toBeTruthy();
    expect(within(entryRow(7)).getByText(/Compañero agregado/)).toBeTruthy();
  });

  /**
   * Only an admin's own, still-standing decision is undoable. A refund looks
   * like an admin adjustment in the ledger but taking it back would strand
   * the participant's credits.
   */
  it("offers a revert only on admin decisions that still stand", () => {
    renderTable();

    const withRevert = [1, 2, 3, 4, 5, 6, 7].filter(
      (id) =>
        within(entryRow(id)).queryByRole("button", { name: /Revertir/ }) !=
        null,
    );
    expect(withRevert).toEqual([4, 6]);
  });

  it("shows no revert control to someone who cannot adjust", () => {
    renderTable({ canAdjust: false });

    expect(screen.queryAllByRole("button", { name: /Revertir/ })).toHaveLength(
      0,
    );
  });

  it("links each entry to its participant unless the page is one account", () => {
    const { unmount } = renderTable();
    expect(
      within(entryRow(4))
        .getByRole("link", { name: /Ana/ })
        .getAttribute("href"),
    ).toBe("/dashboard/credits/accounts/8");
    unmount();

    renderTable({ showUser: false });
    expect(within(entryRow(4)).queryByRole("link", { name: /Ana/ })).toBeNull();
  });

  it("totals what the filter matched", () => {
    renderTable();

    expect(screen.getByText(/Entradas/).textContent?.replace(/\s+/g, " ")).toBe(
      "Entradas +Bs165.00 · salidas -Bs75.00",
    );
    expect(screen.getByText("1–7 de 7")).toBeTruthy();
  });

  it("says so when nothing matches", () => {
    renderTable({ rows: [], rowCount: 0 });

    expect(
      within(screen.getByRole("table")).getByText(
        "Ningún movimiento coincide con el filtro.",
      ),
    ).toBeTruthy();
  });
});
