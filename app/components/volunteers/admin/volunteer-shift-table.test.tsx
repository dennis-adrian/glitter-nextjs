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
  setActive: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
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
  toast: {
    success: mocks.success,
    warning: mocks.warning,
    error: mocks.error,
  },
}));

import VolunteerShiftTable, {
  shiftChosenWarning,
  volunteerShiftDraft,
} from "@/app/components/volunteers/admin/volunteer-shift-table";
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
    neededHeadcount: 8,
    sortOrder: 2,
    isActive: true,
    availableCount: 14,
    assignedCount: 4,
    unassignedAvailableCount: 10,
    ...overrides,
  };
}

const LATER = shift({
  id: 2,
  label: "Festival (turno A)",
  // Saturday 19 December, 13:30–17:30 in La Paz.
  startsAt: new Date("2026-12-19T17:30:00Z"),
  endsAt: new Date("2026-12-19T21:30:00Z"),
  sortOrder: 1,
  availableCount: 1,
  unassignedAvailableCount: 1,
});

/** The md+ table; the phone cards repeat the same data below it. */
function desktop() {
  return within(screen.getByRole("table"));
}

describe("volunteerShiftDraft", () => {
  it("splits a shift into its La Paz day and times", () => {
    expect(volunteerShiftDraft(shift())).toEqual({
      date: "2026-12-18",
      startTime: "15:00",
      endTime: "19:00",
      label: "Montaje",
      neededHeadcount: "8",
    });
  });

  it("starts blank for a new shift", () => {
    expect(volunteerShiftDraft()).toEqual({
      date: "",
      startTime: "",
      endTime: "",
      label: "",
      neededHeadcount: "0",
    });
  });
});

describe("shiftChosenWarning", () => {
  it("names how many chose it and its saved hours", () => {
    expect(shiftChosenWarning(shift())).toBe(
      "14 personas ya eligieron este turno con el horario 15:00–19:00. Si cambiás el día o la hora, avisales por WhatsApp.",
    );
    expect(shiftChosenWarning(LATER)).toMatch(/^1 persona ya eligió/);
  });
});

describe("VolunteerShiftTable", () => {
  it("lists the shifts chronologically with day, hours, cupo and choices", () => {
    render(<VolunteerShiftTable festivalId={9} shifts={[LATER, shift()]} />);

    const rows = desktop().getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByText("Vie 18 dic")).toBeTruthy();
    expect(first.getByText("15:00–19:00")).toBeTruthy();
    expect(first.getByText("Montaje")).toBeTruthy();
    expect(first.getByText("8")).toBeTruthy();
    expect(first.getByText("14")).toBeTruthy();
    expect(within(rows[1]!).getByText("Sáb 19 dic")).toBeTruthy();
    expect(
      desktop().getByRole("checkbox", { name: "Montaje, viernes 18, activo" }),
    ).toBeTruthy();
  });

  it("toggles a shift's active state at once", async () => {
    mocks.setActive.mockResolvedValue({ success: true, message: "Listo." });
    render(<VolunteerShiftTable festivalId={9} shifts={[shift()]} />);

    fireEvent.click(
      desktop().getByRole("checkbox", { name: "Montaje, viernes 18, activo" }),
    );

    await waitFor(() =>
      expect(mocks.setActive).toHaveBeenCalledWith({
        festivalId: 9,
        id: 4,
        isActive: false,
      }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.success).toHaveBeenCalledWith("Listo.");
  });

  it("edits a shift in place, warns about who chose it and saves the raw values", async () => {
    mocks.save.mockResolvedValue({ success: true, message: "Guardado." });
    render(<VolunteerShiftTable festivalId={9} shifts={[shift()]} />);

    fireEvent.click(
      desktop().getByRole("button", { name: "Editar Montaje, viernes 18" }),
    );

    expect(desktop().getByLabelText("Día")).toHaveProperty(
      "value",
      "2026-12-18",
    );
    expect(desktop().getByLabelText("Hora de inicio")).toHaveProperty(
      "value",
      "15:00",
    );
    expect(desktop().getByRole("status").textContent).toContain(
      "14 personas ya eligieron este turno con el horario 15:00–19:00",
    );

    fireEvent.change(desktop().getByLabelText("Hora de fin"), {
      target: { value: "20:00" },
    });
    fireEvent.change(desktop().getByLabelText("Cupo"), {
      target: { value: "10" },
    });
    fireEvent.click(desktop().getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        festivalId: 9,
        shiftId: 4,
        date: "2026-12-18",
        startTime: "15:00",
        endTime: "20:00",
        label: "Montaje",
        neededHeadcount: "10",
      }),
    );
    await waitFor(() => expect(desktop().queryByLabelText("Día")).toBeNull());
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows the action's warning when a move goes past the per-day limit", async () => {
    const warning =
      "Turno actualizado. Lucía Mamani quedó con más de 2 turnos el sábado 19 de diciembre.";
    mocks.save.mockResolvedValue({
      success: true,
      message: "Turno actualizado.",
      warning,
    });
    render(
      <VolunteerShiftTable
        festivalId={9}
        shifts={[shift()]}
        initialEditing={4}
      />,
    );

    fireEvent.click(desktop().getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mocks.warning).toHaveBeenCalledWith(warning));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("refuses an empty cupo instead of saving it as 0", async () => {
    render(
      <VolunteerShiftTable
        festivalId={9}
        shifts={[shift()]}
        initialEditing={4}
      />,
    );

    fireEvent.change(desktop().getByLabelText("Cupo"), {
      target: { value: "" },
    });
    fireEvent.click(desktop().getByRole("button", { name: "Guardar" }));

    expect(await desktop().findByText("Indicá el cupo.")).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("cancels an edit without saving", () => {
    render(<VolunteerShiftTable festivalId={9} shifts={[shift()]} />);

    fireEvent.click(
      desktop().getByRole("button", { name: "Editar Montaje, viernes 18" }),
    );
    fireEvent.click(desktop().getByRole("button", { name: "Cancelar" }));

    expect(desktop().queryByLabelText("Día")).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("adds a shift from a blank row and refuses an end before the start", async () => {
    render(<VolunteerShiftTable festivalId={9} shifts={[shift()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar turno" }));
    fireEvent.change(desktop().getByLabelText("Día"), {
      target: { value: "2026-12-20" },
    });
    fireEvent.change(desktop().getByLabelText("Hora de inicio"), {
      target: { value: "20:00" },
    });
    fireEvent.change(desktop().getByLabelText("Hora de fin"), {
      target: { value: "18:00" },
    });
    fireEvent.change(desktop().getByLabelText("Nombre del turno"), {
      target: { value: "Cierre" },
    });
    fireEvent.click(desktop().getByRole("button", { name: "Guardar" }));

    expect(
      await desktop().findByText("El fin tiene que ser posterior al inicio."),
    ).toBeTruthy();
    expect(desktop().getByLabelText("Hora de fin")).toHaveProperty(
      "ariaInvalid",
      "true",
    );
    expect(mocks.save).not.toHaveBeenCalled();
    // A new shift has nobody yet: no warning.
    expect(desktop().queryByRole("status")).toBeNull();
  });

  it("keeps the editor open when the action refuses", async () => {
    mocks.save.mockResolvedValue({ success: false, message: "No." });
    render(
      <VolunteerShiftTable
        festivalId={9}
        shifts={[shift()]}
        initialEditing={4}
      />,
    );

    fireEvent.click(desktop().getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("No."));
    expect(desktop().getByLabelText("Día")).toBeTruthy();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("locks switching editors while a save is in flight", async () => {
    let finish!: (result: { success: boolean; message: string }) => void;
    mocks.save.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <VolunteerShiftTable
        festivalId={9}
        shifts={[shift(), LATER]}
        initialEditing={4}
      />,
    );

    fireEvent.click(desktop().getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());

    // Desktop row and phone card alike.
    const other = screen.getAllByRole("button", {
      name: "Editar Festival (turno A), sábado 19",
    }) as HTMLButtonElement[];
    expect(other).toHaveLength(2);
    for (const button of other) expect(button.disabled).toBe(true);
    const add = screen.getByRole("button", {
      name: "Agregar turno",
    }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);

    fireEvent.click(other[0]!);
    fireEvent.click(add);
    expect(desktop().getByLabelText("Día")).toHaveProperty(
      "value",
      "2026-12-18",
    );

    finish({ success: true, message: "Guardado." });
    await waitFor(() => expect(desktop().queryByLabelText("Día")).toBeNull());
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("says so when there are no shifts", () => {
    render(<VolunteerShiftTable festivalId={9} shifts={[]} />);
    expect(desktop().getByText(/Todavía no hay turnos/)).toBeTruthy();
  });
});
