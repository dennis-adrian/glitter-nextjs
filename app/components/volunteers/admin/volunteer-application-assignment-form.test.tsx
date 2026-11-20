// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  updateVolunteerAssignment: mocks.assign,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

import VolunteerApplicationAssignmentForm, {
  assignableShiftDays,
} from "@/app/components/volunteers/admin/volunteer-application-assignment-form";
import type { VolunteerShiftCoverage } from "@/app/lib/volunteers/admin-definitions";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const roles = [
  { id: 1, name: "Fotografía", description: "", sortOrder: 0, isActive: true },
  { id: 2, name: "Prensa", description: "", sortOrder: 1, isActive: false },
];

function shift(
  id: number,
  startsAt: string,
  overrides: Partial<VolunteerShiftCoverage> = {},
): VolunteerShiftCoverage {
  const start = new Date(startsAt);
  return {
    id,
    label: `Turno ${id}`,
    startsAt: start,
    endsAt: new Date(start.getTime() + 3 * 60 * 60 * 1000),
    neededHeadcount: 4,
    sortOrder: 0,
    isActive: true,
    availableCount: 1,
    assignedCount: 1,
    ...overrides,
  };
}

// Saturday 19 December in La Paz (UTC-4): three shifts on the same day.
const shifts = [
  shift(1, "2026-12-19T13:00:00Z"),
  shift(2, "2026-12-19T17:00:00Z"),
  shift(3, "2026-12-19T21:00:00Z"),
  shift(4, "2026-12-20T13:00:00Z", { isActive: false }),
  shift(5, "2026-12-20T17:00:00Z", { isActive: false }),
];

function renderForm(
  overrides: Partial<{
    status: "pending" | "accepted" | "waitlist" | "rejected";
    assignedRoleId: number | null;
    availableShiftIds: number[];
    assignedShiftIds: number[];
  }> = {},
) {
  return render(
    <VolunteerApplicationAssignmentForm
      festivalId={619}
      application={{
        id: 42,
        status: "accepted",
        assignedRoleId: null,
        availableShiftIds: [1, 2],
        assignedShiftIds: [],
        ...overrides,
      }}
      roles={roles}
      shifts={shifts}
    />,
  );
}

function shiftItem(id: number) {
  const item = document.querySelector(`[data-shift-id="${id}"]`);
  if (!(item instanceof HTMLElement)) throw new Error(`No shift ${id}`);
  return within(item);
}

describe("assignableShiftDays", () => {
  it("groups active shifts and assigned inactive ones by La Paz day", () => {
    const days = assignableShiftDays(shifts, [4]);
    expect(days.map((day) => day.day)).toEqual(["2026-12-19", "2026-12-20"]);
    expect(days[0]!.shifts.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(days[1]!.shifts.map((s) => s.id)).toEqual([4]);
  });
});

describe("VolunteerApplicationAssignmentForm", () => {
  it("is locked until the application is accepted", () => {
    renderForm({ status: "pending" });
    expect(
      screen.getByText("Aceptá la postulación para asignarle un rol y turnos."),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Guardar asignación",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect((checkbox as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("marks the applicant's shifts as available and flags the others", () => {
    renderForm({ assignedShiftIds: [4] });
    expect(shiftItem(1).getByText("Disponible")).toBeTruthy();
    expect(shiftItem(1).getByText("1/4 asignados")).toBeTruthy();
    expect(shiftItem(3).getByText("No lo marcó como disponible")).toBeTruthy();
    expect(shiftItem(4).getByText(/inactivo/)).toBeTruthy();
    expect(document.querySelector('[data-shift-id="5"]')).toBeNull();
  });

  it("warns and refuses to save more than two shifts in a day", () => {
    renderForm();
    for (const id of [1, 2, 3]) {
      fireEvent.click(shiftItem(id).getByRole("checkbox"));
    }
    expect(screen.getByRole("alert").textContent).toBe(
      "Máximo 2 turnos por día: revisá el sábado 19 de diciembre.",
    );
    const save = screen.getByRole("button", { name: "Guardar asignación" });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(shiftItem(3).getByRole("checkbox"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves the role and shifts and refreshes", async () => {
    mocks.assign.mockResolvedValue({
      success: true,
      message: "Asignación guardada.",
    });
    renderForm({ assignedRoleId: 2, assignedShiftIds: [1] });
    expect(screen.getByLabelText("Rol asignado").textContent).toContain(
      "Prensa (inactivo)",
    );
    fireEvent.click(shiftItem(3).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar asignación" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.assign).toHaveBeenCalledWith({
      festivalId: 619,
      applicationId: 42,
      roleId: 2,
      shiftIds: [1, 3],
    });
    expect(mocks.success).toHaveBeenCalledWith("Asignación guardada.");
  });

  it("shows the refusal without refreshing", async () => {
    mocks.assign.mockResolvedValue({ success: false, message: "No." });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar asignación" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("No."));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
