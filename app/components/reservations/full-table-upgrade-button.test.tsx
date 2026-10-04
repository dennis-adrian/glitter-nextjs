// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The button reaches a "use server" module that imports `server-only`, which
// throws outside a server build.
vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/reservations/full-table-actions", () => ({
  upgradeFullTableReservationAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import FullTableUpgradeButton from "@/app/components/reservations/full-table-upgrade-button";
import { upgradeFullTableReservationAction } from "@/app/lib/reservations/full-table-actions";
import {
  fullTableUpgradeExpectation,
  planFullTableUpgrade,
} from "@/app/lib/reservations/full-table-upgrade";
import type { FullTableUpgradePreview } from "@/app/lib/reservations/full-table-upgrade-queries";
import { toast } from "sonner";

const action = vi.mocked(upgradeFullTableReservationAction);

const KEY = "00000000-0000-4000-8000-000000000000";

/** A paid half at 300 moving to a 450 table: a balance of 150 reopens. */
function preview(
  overrides: Partial<FullTableUpgradePreview> = {},
): FullTableUpgradePreview {
  const plan = planFullTableUpgrade({
    tablePrice: 450,
    priceAmountSnapshot: 300,
    liveInvoice: { originalAmount: 300, discountAmount: 0, amount: 300 },
    coveredAmount: 300,
    latePartnerPrepaid: 0,
    reservationStatus: "accepted",
    zeroValueEntitlementApproved: false,
  });
  return {
    reservationStatus: "accepted",
    keptStand: { id: 1, label: "A1" },
    inFullTableGroup: true,
    groupIssue: null,
    companion: { id: 2, label: "A2" },
    companionState: "free",
    tablePrice: 450,
    proofUnderReview: false,
    hasInvoice: true,
    hasOwner: true,
    hasTender: true,
    plan,
    expected: fullTableUpgradeExpectation(plan),
    ...overrides,
  };
}

function renderButton(
  disabledReason?: string | null,
  overrides: Partial<FullTableUpgradePreview> = {},
) {
  return render(
    <FullTableUpgradeButton
      reservationId={42}
      preview={preview(overrides)}
      disabledReason={disabledReason}
    />,
  );
}

function openDialog() {
  fireEvent.click(
    screen.getByRole("button", { name: "Ampliar a mesa completa" }),
  );
}

function confirmDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Ampliar" }));
}

describe("FullTableUpgradeButton", () => {
  beforeEach(() => {
    crypto.randomUUID = () => KEY as ReturnType<typeof crypto.randomUUID>;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("names the kept half and the companion before confirming", () => {
    renderButton();
    openDialog();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("¿Ampliar a mesa completa?");
    expect(dialog.textContent).toContain(
      "La reserva suma el espacio A2 y pasa a ocupar la mesa completa: A1 y A2.",
    );
  });

  /**
   * Unlike the stand switch, the preview knows the numbers, so the admin reads
   * the actual cobro and balance rather than the general rule.
   */
  it("states the amounts the server is going to apply", () => {
    renderButton();
    openDialog();

    const text = screen.getByRole("alertdialog").textContent ?? "";
    expect(text).toContain("El cobro pasa de Bs300 a Bs450");
    expect(text).toContain("Ya hay Bs300 pagados");
    expect(text).toContain("pendiente por la diferencia de Bs150");
    expect(text).toContain("después no vas a poder reducirla a media mesa");
    expect(text).toContain("No se cobran créditos");
  });

  it("sends the reservation, a key and the confirmed amounts", async () => {
    action.mockResolvedValue({
      success: true,
      message: "La reserva ahora ocupa la mesa completa.",
      settlement: { kind: "balance_due", amount: 150 },
    });
    renderButton();
    openDialog();
    confirmDialog();

    expect(action).toHaveBeenCalledWith({
      reservationId: 42,
      idempotencyKey: KEY,
      expected: {
        tablePrice: 450,
        settlementKind: "balance_due",
        settlementAmount: 150,
      },
    });
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "La reserva ahora ocupa la mesa completa.",
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  /**
   * Any refusal may mean the numbers moved, so the page is re-read and the next
   * attempt runs under a new key rather than replaying the refused one.
   */
  it("reports a refusal, refreshes, and confirms again under a new key", async () => {
    let minted = 0;
    crypto.randomUUID = () =>
      `00000000-0000-4000-8000-00000000000${minted++}` as ReturnType<
        typeof crypto.randomUUID
      >;
    action.mockResolvedValue({
      success: false,
      message: "La otra mitad de la mesa ya está ocupada por otra reserva.",
      code: "FULL_TABLE_COMPANION_TAKEN",
    });
    renderButton();
    openDialog();
    confirmDialog();

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "La otra mitad de la mesa ya está ocupada por otra reserva.",
      ),
    );
    expect(refresh).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(screen.queryByRole("alertdialog")).toBeNull(),
    );

    openDialog();
    confirmDialog();
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[0][0]).toMatchObject({
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
    });
    expect(action.mock.calls[1][0]).toMatchObject({
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
    });
  });

  /**
   * The server's stale message asks the admin to refresh; the dialog has
   * already done that, so it says where the new numbers are instead.
   */
  it("points a stale confirmation at the refreshed amounts", async () => {
    action.mockResolvedValue({
      success: false,
      message:
        "El monto cambió desde que abriste el diálogo. Actualizá la página y revisalo de nuevo.",
      code: "FULL_TABLE_UPGRADE_STALE",
    });
    renderButton();
    openDialog();
    confirmDialog();

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "El monto cambió desde que abriste el diálogo. Abrilo de nuevo para ver los montos actualizados.",
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  /**
   * A thrown call may have committed on the server. The key is kept so the
   * retry replays it instead of running a second upgrade.
   */
  it("keeps the key and the dialog after a lost response", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let minted = 0;
    crypto.randomUUID = () =>
      `00000000-0000-4000-8000-00000000000${minted++}` as ReturnType<
        typeof crypto.randomUUID
      >;
    action.mockRejectedValueOnce(new Error("network"));
    renderButton();
    openDialog();
    confirmDialog();

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se pudo ampliar la reserva. Intentá nuevamente.",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    action.mockResolvedValueOnce({
      success: true,
      message: "La reserva ahora ocupa la mesa completa.",
      settlement: { kind: "balance_due", amount: 150 },
    });
    await vi.waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Ampliar" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    confirmDialog();
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[0][0]).toMatchObject({
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
    });
    expect(action.mock.calls[1][0]).toMatchObject({
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
    });
    consoleError.mockRestore();
  });

  /**
   * A festival admin has no rights here and the service would refuse them.
   * The control stays visible and inert so the action reads as restricted
   * rather than missing.
   */
  it("stays visible but inert with its reason", () => {
    renderButton("Solo un administrador general puede ampliar una reserva.");

    const trigger = screen.getByRole("button", {
      name: "Ampliar a mesa completa",
    });
    expect(trigger.hasAttribute("disabled")).toBe(true);
    expect(trigger.getAttribute("title")).toBe(
      "Solo un administrador general puede ampliar una reserva.",
    );
    expect(
      screen.getByText(
        "Solo un administrador general puede ampliar una reserva.",
      ),
    ).toBeTruthy();

    fireEvent.click(trigger);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("stays inert when there is no plan to confirm", () => {
    renderButton(null, {
      groupIssue: "unpriced",
      tablePrice: null,
      plan: null,
      expected: null,
    });

    const trigger = screen.getByRole("button", {
      name: "Ampliar a mesa completa",
    });
    expect(trigger.hasAttribute("disabled")).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
