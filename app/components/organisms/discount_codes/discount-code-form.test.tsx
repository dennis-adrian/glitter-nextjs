import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiscountCodeWithRelations } from "@/app/lib/discount_codes/definitions";

const { createDiscountCode, updateDiscountCode } = vi.hoisted(() => ({
  createDiscountCode: vi.fn(),
  updateDiscountCode: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/lib/discount_codes/actions", () => ({
  createDiscountCode,
  updateDiscountCode,
  searchDiscountCodeUsers: vi.fn().mockResolvedValue([]),
}));

import DiscountCodeForm from "./discount-code-form";

const festivalsOptions = [
  { value: "4", label: "Glitter Primavera" },
  { value: "5", label: "Glitter Invierno" },
];

const stored: DiscountCodeWithRelations = {
  id: 3,
  code: "vip",
  discountUnit: "percentage",
  discountValue: 20,
  maxUses: null,
  currentUses: 0,
  festivalId: 4,
  audience: "everyone",
  // The old form's UTC-midnight value; saving must not move it.
  expiresAt: new Date("2099-01-01T00:00:00Z"),
  isActive: true,
  updatedAt: new Date(),
  createdAt: new Date(),
  festival: { id: 4, name: "Glitter Primavera" },
  assignedUsers: [],
};

function pickFestival(current: string, next: string) {
  fireEvent.click(screen.getByRole("combobox", { name: /Festival/ }));
  expect(screen.getByRole("combobox", { name: /Festival/ }).textContent).toBe(
    current,
  );
  fireEvent.click(screen.getByRole("option", { name: next }));
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  createDiscountCode.mockResolvedValue({ success: true, message: "ok" });
  updateDiscountCode.mockResolvedValue({ success: true, message: "ok" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DiscountCodeForm", () => {
  it("saves a change to the festival alone, with the expiry untouched", async () => {
    render(
      <DiscountCodeForm
        festivalsOptions={festivalsOptions}
        discountCode={stored}
      />,
    );
    const save = screen.getByRole("button", {
      name: "Guardar cambios",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    pickFestival("Glitter Primavera", "Glitter Invierno");

    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() =>
      expect(updateDiscountCode).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          festivalId: 5,
          expiresAt: new Date("2099-01-01T00:00:00Z"),
        }),
      ),
    );
  });

  it("can put a festival-bound code back on every festival", async () => {
    render(
      <DiscountCodeForm
        festivalsOptions={festivalsOptions}
        discountCode={stored}
      />,
    );

    pickFestival("Glitter Primavera", "Todos los festivales");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateDiscountCode).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ festivalId: null }),
      ),
    );
  });

  it("will not create a reserved code with nobody on it", async () => {
    render(<DiscountCodeForm festivalsOptions={festivalsOptions} />);

    fireEvent.change(screen.getByLabelText("Código"), {
      target: { value: "SOLO" },
    });
    fireEvent.change(screen.getByLabelText("Valor (%)"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "1 mes" }));
    fireEvent.click(
      screen.getByRole("radio", { name: /Usuarios específicos/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Crear código" }));

    expect(await screen.findByText("Agregá al menos un usuario")).toBeTruthy();
    expect(createDiscountCode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /Cualquier usuario/ }));
    fireEvent.click(screen.getByRole("button", { name: "Crear código" }));
    await waitFor(() =>
      expect(createDiscountCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "SOLO",
          discountValue: 15,
          audience: "everyone",
          userIds: [],
        }),
      ),
    );
  });
});
