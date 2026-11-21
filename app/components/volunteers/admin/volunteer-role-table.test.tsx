// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  move: vi.fn(),
  setActive: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  saveVolunteerRole: mocks.save,
  moveVolunteerRole: mocks.move,
  setVolunteerRoleActive: mocks.setActive,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

import VolunteerRoleTable from "@/app/components/volunteers/admin/volunteer-role-table";
import type { VolunteerAdminRole } from "@/app/lib/volunteers/admin-definitions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const role = (
  id: number,
  name: string,
  sortOrder: number,
  overrides: Partial<VolunteerAdminRole> = {},
): VolunteerAdminRole => ({
  id,
  name,
  description: `Qué hace ${name}.`,
  sortOrder,
  isActive: true,
  choiceCount: id * 3,
  ...overrides,
});

// Out of order on purpose: the table sorts by sortOrder.
const ROLES = [
  role(2, "Orientación al público", 2),
  role(1, "Acreditación", 1),
  role(3, "Apoyo a expositores", 3),
];

function desktop() {
  return within(screen.getByRole("table"));
}

describe("VolunteerRoleTable", () => {
  it("lists the roles in order with how many chose each", () => {
    render(<VolunteerRoleTable festivalId={9} roles={ROLES} />);

    const rows = desktop().getAllByRole("row").slice(1);
    expect(
      rows.map((row) => within(row).getAllByRole("cell")[1]!.textContent),
    ).toEqual([
      "Acreditación",
      "Orientación al público",
      "Apoyo a expositores",
    ]);
    expect(within(rows[0]!).getByText("3")).toBeTruthy();
    expect(within(rows[0]!).getByText("Qué hace Acreditación.")).toBeTruthy();
  });

  it("disables moving the first up and the last down", () => {
    render(<VolunteerRoleTable festivalId={9} roles={ROLES} />);

    const button = (name: string) =>
      desktop().getByRole("button", { name }) as HTMLButtonElement;
    expect(button("Subir Acreditación").disabled).toBe(true);
    expect(button("Bajar Acreditación").disabled).toBe(false);
    expect(button("Subir Apoyo a expositores").disabled).toBe(false);
    expect(button("Bajar Apoyo a expositores").disabled).toBe(true);
  });

  it("moves a role and refreshes", async () => {
    mocks.move.mockResolvedValue({ success: true, message: "Orden." });
    render(<VolunteerRoleTable festivalId={9} roles={ROLES} />);

    fireEvent.click(
      desktop().getByRole("button", { name: "Bajar Orientación al público" }),
    );

    await waitFor(() =>
      expect(mocks.move).toHaveBeenCalledWith({
        festivalId: 9,
        roleId: 2,
        direction: "down",
      }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("toggles a role's active state", async () => {
    mocks.setActive.mockResolvedValue({ success: true, message: "Listo." });
    render(<VolunteerRoleTable festivalId={9} roles={ROLES} />);

    fireEvent.click(
      desktop().getByRole("checkbox", { name: "Acreditación, activo" }),
    );

    await waitFor(() =>
      expect(mocks.setActive).toHaveBeenCalledWith({
        festivalId: 9,
        id: 1,
        isActive: false,
      }),
    );
  });

  it("edits a role in place without sending an order", async () => {
    mocks.save.mockResolvedValue({ success: true, message: "Guardado." });
    render(<VolunteerRoleTable festivalId={9} roles={ROLES} />);

    fireEvent.click(
      desktop().getByRole("button", { name: "Editar Acreditación" }),
    );
    fireEvent.change(desktop().getByLabelText("Nombre del rol"), {
      target: { value: "Acreditación y check-in" },
    });
    fireEvent.click(desktop().getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        festivalId: 9,
        roleId: 1,
        name: "Acreditación y check-in",
        description: "Qué hace Acreditación.",
      }),
    );
    await waitFor(() =>
      expect(desktop().queryByLabelText("Nombre del rol")).toBeNull(),
    );
  });

  it("asks for the name and description of a new role", () => {
    render(<VolunteerRoleTable festivalId={9} roles={[]} />);

    expect(desktop().getByText(/Todavía no hay roles/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Agregar rol" }));
    fireEvent.click(desktop().getByRole("button", { name: "Guardar" }));

    expect(desktop().getByText("Escribí el nombre del rol.")).toBeTruthy();
    expect(desktop().getByText("Escribí una descripción corta.")).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
