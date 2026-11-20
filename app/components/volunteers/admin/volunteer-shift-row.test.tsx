// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  setActive: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  saveVolunteerShift: mocks.save,
  setVolunteerShiftActive: mocks.setActive,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

import VolunteerShiftForm, {
  volunteerShiftDefaults,
} from "@/app/components/volunteers/admin/volunteer-shift-form";
import VolunteerShiftRow from "@/app/components/volunteers/admin/volunteer-shift-row";
import type { VolunteerShiftCoverage } from "@/app/lib/volunteers/admin-definitions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function shift(
  overrides: Partial<VolunteerShiftCoverage> = {},
): VolunteerShiftCoverage {
  return {
    id: 4,
    label: "Montaje",
    // Friday 18 December, 15:00–19:00 in La Paz.
    startsAt: new Date("2026-12-18T19:00:00Z"),
    endsAt: new Date("2026-12-18T23:00:00Z"),
    neededHeadcount: 6,
    sortOrder: 2,
    isActive: true,
    availableCount: 9,
    assignedCount: 4,
    ...overrides,
  };
}

describe("VolunteerShiftRow", () => {
  it("shows when, coverage and a short shift highlighted", () => {
    render(<VolunteerShiftRow festivalId={9} shift={shift()} />);

    expect(screen.getByText("Montaje")).toBeTruthy();
    expect(screen.getByText("Vie 18 dic · 15:00–19:00")).toBeTruthy();
    expect(screen.getByText("4/6")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("Activo")).toBeTruthy();
    expect(
      screen.getByTestId("volunteer-shift-assigned").hasAttribute("data-short"),
    ).toBe(true);
  });

  it("does not highlight a full shift or one without a cupo", () => {
    const { rerender } = render(
      <VolunteerShiftRow festivalId={9} shift={shift({ assignedCount: 6 })} />,
    );
    expect(
      screen.getByTestId("volunteer-shift-assigned").hasAttribute("data-short"),
    ).toBe(false);

    rerender(
      <VolunteerShiftRow
        festivalId={9}
        shift={shift({ neededHeadcount: 0, assignedCount: 0 })}
      />,
    );
    expect(
      screen.getByTestId("volunteer-shift-assigned").hasAttribute("data-short"),
    ).toBe(false);
  });

  it("deactivates and reactivates the shift", async () => {
    mocks.setActive.mockResolvedValue({ success: true, message: "Listo." });
    const { rerender } = render(
      <VolunteerShiftRow festivalId={9} shift={shift()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
    await waitFor(() =>
      expect(mocks.setActive).toHaveBeenCalledWith({
        festivalId: 9,
        id: 4,
        isActive: false,
      }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());

    rerender(
      <VolunteerShiftRow festivalId={9} shift={shift({ isActive: false })} />,
    );
    expect(screen.getByText("Inactivo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }));
    await waitFor(() =>
      expect(mocks.setActive).toHaveBeenLastCalledWith({
        festivalId: 9,
        id: 4,
        isActive: true,
      }),
    );
  });

  it("edits in place with the shift's La Paz times", () => {
    render(<VolunteerShiftRow festivalId={9} shift={shift()} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText(/Inicio/)).toHaveProperty(
      "value",
      "2026-12-18T15:00",
    );
    expect(screen.getByLabelText(/^Fin/)).toHaveProperty(
      "value",
      "2026-12-18T19:00",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar edición" }));
    expect(screen.queryByLabelText(/Inicio/)).toBeNull();
  });
});

describe("volunteerShiftDefaults", () => {
  it("converts an existing shift to La Paz datetime-local values", () => {
    expect(volunteerShiftDefaults(9, shift())).toEqual({
      festivalId: 9,
      shiftId: 4,
      label: "Montaje",
      startsAt: "2026-12-18T15:00",
      endsAt: "2026-12-18T19:00",
      neededHeadcount: "6",
      sortOrder: "2",
    });
  });
});

describe("VolunteerShiftForm", () => {
  function fill(values: Record<string, string>) {
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(new RegExp(label)), {
        target: { value },
      });
    }
  }

  it("refuses an end before the start", async () => {
    render(<VolunteerShiftForm festivalId={9} />);
    fill({
      "Nombre del turno": "Cierre",
      Inicio: "2026-12-19T20:00",
      "^Fin": "2026-12-19T18:00",
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar turno" }));

    expect(
      await screen.findByText("El fin tiene que ser posterior al inicio."),
    ).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("creates a shift with the raw La Paz values and resets", async () => {
    mocks.save.mockResolvedValue({ success: true, message: "Turno agregado." });
    render(<VolunteerShiftForm festivalId={9} nextSortOrder={3} />);
    fill({
      "Nombre del turno": "Cierre",
      Inicio: "2026-12-19T18:00",
      "^Fin": "2026-12-19T22:00",
      Cupo: "5",
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar turno" }));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        festivalId: 9,
        shiftId: undefined,
        label: "Cierre",
        startsAt: "2026-12-19T18:00",
        endsAt: "2026-12-19T22:00",
        neededHeadcount: "5",
        sortOrder: "3",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Nombre del turno/)).toHaveProperty(
        "value",
        "",
      ),
    );
    expect(screen.getByLabelText(/Orden/)).toHaveProperty("value", "4");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows the action's refusal", async () => {
    mocks.save.mockResolvedValue({ success: false, message: "No." });
    render(<VolunteerShiftForm festivalId={9} />);
    fill({
      "Nombre del turno": "Cierre",
      Inicio: "2026-12-19T18:00",
      "^Fin": "2026-12-19T22:00",
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar turno" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("No."));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
