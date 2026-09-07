// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { adjustCreditAccountAction } = vi.hoisted(() => ({
  adjustCreditAccountAction: vi.fn(async () => ({
    success: true as const,
    message: "Saldo ajustado.",
  })),
}));
vi.mock("@/app/lib/credits/actions", () => ({ adjustCreditAccountAction }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// The dialog picks its layout from a media query jsdom does not implement.
vi.mock("@/app/hooks/use-media-query", () => ({ useMediaQuery: () => true }));

import CreditAdjustDialog from "@/app/components/credits/admin/credit-adjust-dialog";

function open(canAdjust = true) {
  return render(
    <CreditAdjustDialog
      userId={11}
      participantName="Ana"
      canAdjust={canAdjust}
      open
      onOpenChange={vi.fn()}
    />,
  );
}

function fill(amount: string, reason = "Compensación") {
  fireEvent.change(screen.getByLabelText("Cantidad de créditos"), {
    target: { value: amount },
  });
  fireEvent.change(screen.getByLabelText("Motivo"), {
    target: { value: reason },
  });
}

describe("CreditAdjustDialog", () => {
  afterEach(() => {
    cleanup();
    adjustCreditAccountAction.mockClear();
  });

  it("grants the amount as typed", async () => {
    open();
    fill("20");
    fireEvent.click(screen.getByRole("button", { name: /Otorgar/ }));

    await waitFor(() => expect(adjustCreditAccountAction).toHaveBeenCalled());
    expect(adjustCreditAccountAction.mock.calls[0][0]).toMatchObject({
      userId: 11,
      amount: 20,
      reason: "Compensación",
    });
  });

  it("sends the same amount negated when discounting", async () => {
    // One field, two directions: the sign is the button's job, so an admin
    // never has to type a minus that the schema would then have to interpret.
    open();
    fill("20");
    fireEvent.click(screen.getByRole("button", { name: "Descontar" }));

    await waitFor(() => expect(adjustCreditAccountAction).toHaveBeenCalled());
    expect(adjustCreditAccountAction.mock.calls[0][0]).toMatchObject({
      amount: -20,
    });
  });

  it("refuses to submit without a reason", () => {
    // The ledger entry is the only record of why a balance moved, and it is
    // what the participant reads in their own movements.
    open();
    fireEvent.change(screen.getByLabelText("Cantidad de créditos"), {
      target: { value: "20" },
    });

    const grant = screen.getByRole("button", {
      name: /Otorgar/,
    }) as HTMLButtonElement;
    expect(grant.disabled).toBe(true);
  });

  it("stays disabled for an admin who cannot adjust", () => {
    open(false);
    fill("20");

    expect(
      (screen.getByRole("button", { name: /Otorgar/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
