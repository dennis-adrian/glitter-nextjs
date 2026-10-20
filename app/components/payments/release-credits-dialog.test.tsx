import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/lib/reservations/payment-actions", () => ({
  releaseInvoiceCreditsAction: vi.fn(),
}));

import ReleaseCreditsDialog from "@/app/components/payments/release-credits-dialog";
import { computeInvoiceTender } from "@/app/lib/payments/tender";

afterEach(cleanup);

/** A cobro with `credits` applied and `refunded` already handed back. */
function invoice(input: {
  amount: number;
  credits: number;
  cash?: number;
  refunded?: number;
}) {
  const tender = computeInvoiceTender({
    amount: input.amount,
    allocations: [{ amount: input.credits, reversed: false }],
    payments: input.cash ? [{ id: 1, amount: input.cash }] : [],
    submissions: input.cash ? [{ paymentId: 1, status: "approved" }] : [],
    refundedAmount: input.refunded ?? 0,
  });
  // The dialog reads only these fields; the full row type is a large
  // relational shape this test has no reason to reproduce.
  return { id: 41, user: { displayName: "Ana" }, tender } as never;
}

function renderDialog(row: ReturnType<typeof invoice>) {
  return render(
    <ReleaseCreditsDialog invoice={row} open onOpenChange={() => {}} />,
  );
}

describe("ReleaseCreditsDialog", () => {
  it("announces the whole allocation when nothing was refunded", () => {
    renderDialog(invoice({ amount: 500, credits: 300 }));
    const dialog = screen.getByRole("dialog");

    expect(dialog.textContent).toContain("Se devolverán Bs300 a la cuenta de");
    expect(dialog.textContent).toContain("pasará a Bs500");
    expect(dialog.textContent).not.toContain("ya volvieron");
    expect(screen.getByRole("button", { name: "Devolver Bs300" })).toBeTruthy();
  });

  /**
   * Bs500 of credits on a cobro moved to a Bs300 stand: Bs200 already came
   * back as a refund, and the server takes it out of the release again. The
   * dialog used to promise Bs500; only the toast said otherwise.
   */
  it("announces what will actually return once a stand change refunded part of it", () => {
    renderDialog(invoice({ amount: 300, credits: 500, refunded: 200 }));
    const dialog = screen.getByRole("dialog");

    expect(dialog.textContent).toContain("Se devolverán Bs300 a la cuenta de");
    expect(dialog.textContent).toContain("pasará a Bs300");
    expect(dialog.textContent).toContain(
      "De los Bs500 aplicados, Bs200 ya volvieron como diferencia a favor de un cambio de espacio, así que no se devuelven de nuevo.",
    );
    expect(screen.getByRole("button", { name: "Devolver Bs300" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Devolver Bs500" })).toBeNull();
  });

  it("takes the refund out of the credits first when cash also paid the cobro", () => {
    // Bs300 cash + Bs200 credits, Bs200 refunded: the credits absorb the whole
    // refund, nothing comes back, and the cobro stays covered by the cash.
    renderDialog(
      invoice({ amount: 300, credits: 200, cash: 300, refunded: 200 }),
    );
    const dialog = screen.getByRole("dialog");

    expect(dialog.textContent).toContain("Se devolverán Bs0 a la cuenta de");
    expect(dialog.textContent).toContain("pasará a Bs0");
    expect(dialog.textContent).toContain(
      "De los Bs200 aplicados, Bs200 ya volvieron",
    );
  });
});
