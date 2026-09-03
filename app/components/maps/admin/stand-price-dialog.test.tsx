// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const updateStandPricesActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/stands/pricing-actions", () => ({
  updateStandPricesAction: updateStandPricesActionMock,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import StandPriceDialog from "@/app/components/maps/admin/stand-price-dialog";

function stand(
  id: number,
  individualPrice: number,
  sharedPrice: number | null,
) {
  return {
    id,
    label: "A",
    standNumber: id,
    standCategory: "illustration" as const,
    individualPrice,
    sharedPrice,
  };
}

function renderDialog(stands: ReturnType<typeof stand>[]) {
  return render(
    <StandPriceDialog
      open
      onOpenChange={vi.fn()}
      stands={stands}
      onSaved={vi.fn()}
    />,
  );
}

/**
 * A blank shared price means "remove it", so the dialog must never send a blank
 * it produced itself. Seeding leaves the field empty whenever the selected
 * stands disagree, which is not the admin asking for anything.
 */
describe("StandPriceDialog shared price", () => {
  afterEach(() => {
    cleanup();
    updateStandPricesActionMock.mockReset();
  });

  it("leaves differing shared prices alone when only the individual changes", async () => {
    updateStandPricesActionMock.mockResolvedValue({ success: true });
    renderDialog([stand(1, 100, 200), stand(2, 100, 250)]);

    fireEvent.change(screen.getByLabelText(/precio individual/i), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await vi.waitFor(() =>
      expect(updateStandPricesActionMock).toHaveBeenCalled(),
    );
    const [updates] = updateStandPricesActionMock.mock.calls[0];
    for (const update of updates) {
      expect(update.individualPrice).toBe(150);
      expect(update).not.toHaveProperty("sharedPrice");
    }
  });

  it("says why the shared field is blank", () => {
    renderDialog([stand(1, 100, 200), stand(2, 100, 250)]);
    expect(screen.getByText(/precios compartidos\s+distintos/i)).toBeTruthy();
  });

  it("applies a shared price the admin actually types", async () => {
    updateStandPricesActionMock.mockResolvedValue({ success: true });
    renderDialog([stand(1, 100, 200), stand(2, 100, 250)]);

    fireEvent.change(screen.getByLabelText(/precio individual/i), {
      target: { value: "150" },
    });
    fireEvent.change(screen.getByLabelText(/precio compartido/i), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await vi.waitFor(() =>
      expect(updateStandPricesActionMock).toHaveBeenCalled(),
    );
    const [updates] = updateStandPricesActionMock.mock.calls[0];
    for (const update of updates) expect(update.sharedPrice).toBe(300);
  });

  it("still clears a shared price the stands agree on", async () => {
    updateStandPricesActionMock.mockResolvedValue({ success: true });
    renderDialog([stand(1, 100, 200), stand(2, 100, 200)]);

    // Seeded with 200 because both agree, so emptying it is a real instruction.
    fireEvent.change(screen.getByLabelText(/precio compartido/i), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await vi.waitFor(() =>
      expect(updateStandPricesActionMock).toHaveBeenCalled(),
    );
    const [updates] = updateStandPricesActionMock.mock.calls[0];
    for (const update of updates) expect(update.sharedPrice).toBeNull();
  });
});
