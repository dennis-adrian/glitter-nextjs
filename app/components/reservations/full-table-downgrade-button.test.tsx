// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The button reaches a "use server" module that imports `server-only`, which
// throws outside a server build.
vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/reservations/full-table-actions", () => ({
  downgradeFullTableReservationAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import FullTableDowngradeButton from "@/app/components/reservations/full-table-downgrade-button";
import { downgradeFullTableReservationAction } from "@/app/lib/reservations/full-table-actions";
import { toast } from "sonner";

const action = vi.mocked(downgradeFullTableReservationAction);

function renderButton(disabledReason?: string) {
  return render(
    <FullTableDowngradeButton
      reservationId={42}
      keptStandLabel="A1"
      releasedStandLabel="A2"
      disabledReason={disabledReason}
    />,
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Reducir a media mesa" }));
}

function confirmDialog() {
  const buttons = screen.getAllByRole("button", {
    name: /Reducir a media mesa/,
  });
  // The trigger and the dialog's confirm share a name; the confirm is the one
  // inside the dialog, which Radix appends after the trigger.
  fireEvent.click(buttons[buttons.length - 1]);
}

describe("FullTableDowngradeButton", () => {
  beforeEach(() => {
    crypto.randomUUID = () =>
      "00000000-0000-4000-8000-000000000000" as ReturnType<
        typeof crypto.randomUUID
      >;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  /**
   * Releasing a stand back to the map is not undoable by the same command, so
   * the warning has to name both halves before anything moves (PRD §13).
   */
  it("names the kept and released halves before confirming", () => {
    renderButton();
    openDialog();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("A1");
    expect(dialog.textContent).toContain("A2");
  });

  /**
   * The three things an admin most needs to know are exactly the three this
   * command decides differently from a refund: the invoice moves, the payments
   * do not, and the access fee is gone.
   */
  it("states what changes and what deliberately does not", () => {
    renderButton();
    openDialog();

    const text = screen.getByRole("alertdialog").textContent ?? "";
    expect(text).toContain("vuelve a estar disponible");
    expect(text).toContain("un solo espacio");
    expect(text).toContain("no se devuelven");
  });

  it("sends the reservation and a fresh idempotency key on confirm", async () => {
    action.mockResolvedValue({ success: true, message: "Listo." });
    renderButton();
    openDialog();
    confirmDialog();

    expect(action).toHaveBeenCalledWith({
      reservationId: 42,
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
    });
  });

  it("reports the server's own refusal rather than a generic error", async () => {
    action.mockResolvedValue({
      success: false,
      message: "Esta reserva no se puede reducir.",
    });
    renderButton();
    openDialog();
    confirmDialog();
    await vi.waitFor(() => expect(action).toHaveBeenCalled());

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Esta reserva no se puede reducir.",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  /**
   * A festival admin has no rights here and the service would refuse them.
   * The control stays visible and inert so the action reads as restricted
   * rather than missing.
   */
  it("stays visible but inert for an admin who may not downgrade", () => {
    renderButton("Solo un administrador general puede reducirla.");

    const trigger = screen.getByRole("button", {
      name: "Reducir a media mesa",
    });
    expect(trigger.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText("Solo un administrador general puede reducirla."),
    ).toBeTruthy();

    fireEvent.click(trigger);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });
});
