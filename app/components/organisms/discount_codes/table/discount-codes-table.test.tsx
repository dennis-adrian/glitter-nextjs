import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiscountCodeWithRelations } from "@/app/lib/discount_codes/definitions";

vi.mock("@/app/lib/discount_codes/actions", () => ({
  setDiscountCodeActive: vi.fn(),
}));

import DiscountCodesTable from "./discount-codes-table";

const DAY = 86_400_000;

function user(id: number, displayName: string) {
  return {
    id,
    displayName,
    firstName: null,
    lastName: null,
    email: `${displayName.toLowerCase()}@example.test`,
    imageUrl: null,
  };
}

function discountCode(
  overrides: Partial<DiscountCodeWithRelations>,
): DiscountCodeWithRelations {
  return {
    id: 1,
    code: "code",
    discountUnit: "percentage",
    discountValue: 10,
    maxUses: null,
    currentUses: 0,
    festivalId: null,
    audience: "everyone",
    expiresAt: new Date(Date.now() + 30 * DAY),
    isActive: true,
    updatedAt: new Date(),
    createdAt: new Date(),
    festival: null,
    assignedUsers: [],
    ...overrides,
  };
}

const rows = [
  discountCode({ id: 1, code: "abierto" }),
  discountCode({
    id: 2,
    code: "vencido",
    expiresAt: new Date(Date.now() - DAY),
  }),
  discountCode({
    id: 3,
    code: "reservado",
    audience: "selected_users",
    assignedUsers: [user(7, "Ana"), user(8, "Beto"), user(9, "Caro")],
    maxUses: 3,
    currentUses: 3,
  }),
];

/** Rows render twice: as phone cards and as the table. */
function isListed(code: string) {
  return screen.queryAllByText(code).length > 0;
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DiscountCodesTable", () => {
  it("hides expired codes until the status filter is cleared", () => {
    render(<DiscountCodesTable discountCodes={rows} />);

    expect(isListed("ABIERTO")).toBe(true);
    expect(isListed("RESERVADO")).toBe(true);
    expect(isListed("VENCIDO")).toBe(false);
    expect(screen.getByText("2 de 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(isListed("VENCIDO")).toBe(true);
  });

  it("says who a reserved code is for and that it ran out", () => {
    render(<DiscountCodesTable discountCodes={rows} />);

    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Ver los 3 usuarios" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Agotado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cualquiera").length).toBeGreaterThan(0);
  });

  it("finds a code by the name of someone it is reserved for", () => {
    render(<DiscountCodesTable discountCodes={rows} />);

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Buscar por código, festival o usuario",
      }),
      { target: { value: "beto" } },
    );

    expect(isListed("RESERVADO")).toBe(true);
    expect(isListed("ABIERTO")).toBe(false);
  });
});
