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
  save: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  saveVolunteerReview: mocks.save,
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

import VolunteerReviewForm, {
  reviewRoleOptions,
  reviewShiftGroups,
  reviewWarning,
} from "@/app/components/volunteers/admin/volunteer-review-form";
import type {
  VolunteerAdminRole,
  VolunteerShiftCoverage,
} from "@/app/lib/volunteers/admin-definitions";

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

const role = (
  id: number,
  name: string,
  overrides: Partial<VolunteerAdminRole> = {},
): VolunteerAdminRole => ({
  id,
  name,
  description: "",
  sortOrder: id,
  isActive: true,
  choiceCount: 0,
  ...overrides,
});

const roles = [
  role(1, "Acreditación"),
  role(2, "Orientación al público"),
  role(3, "Fotografía y redes sociales"),
  role(4, "Prensa", { isActive: false }),
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
    endsAt: new Date(start.getTime() + 4 * 60 * 60 * 1000),
    neededHeadcount: 8,
    sortOrder: id,
    isActive: true,
    availableCount: 5,
    assignedCount: 3,
    unassignedAvailableCount: 2,
    ...overrides,
  };
}

// La Paz is UTC-4. Shift 1 is Friday 18; 2, 3 and 4 are Saturday 19.
const shifts = [
  shift(1, "2026-12-18T19:00:00Z"),
  shift(2, "2026-12-19T14:00:00Z"),
  shift(3, "2026-12-19T17:30:00Z"),
  shift(4, "2026-12-19T21:30:00Z"),
  shift(5, "2026-12-20T17:30:00Z"),
  shift(6, "2026-12-20T21:30:00Z", { isActive: false }),
];

type Application = Parameters<typeof VolunteerReviewForm>[0]["application"];

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: 42,
    status: "accepted",
    firstChoiceRoleId: 3,
    secondChoiceRoleId: 2,
    assignedRoleId: null,
    availableShiftIds: [1, 3, 4],
    assignedShiftIds: [],
    adminNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    updatedAt: new Date("2026-11-21T14:12:00.123Z"),
    ...overrides,
  };
}

function renderForm(overrides: Partial<Application> = {}) {
  return render(
    <VolunteerReviewForm
      festivalId={619}
      application={app(overrides)}
      roles={roles}
      shifts={shifts}
    />,
  );
}

function shiftRow(id: number) {
  const item = document.querySelector(`[data-shift-id="${id}"]`);
  if (!(item instanceof HTMLElement)) throw new Error(`No shift ${id}`);
  return within(item);
}

const saveButton = () =>
  screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement;

describe("reviewRoleOptions", () => {
  it("lists the 1st and 2nd choices first, then active roles and the current one", () => {
    expect(reviewRoleOptions(roles, app()).map((o) => o.label)).toEqual([
      "Fotografía y redes sociales (su 1ª opción)",
      "Orientación al público (su 2ª opción)",
      "Acreditación",
    ]);
    expect(
      reviewRoleOptions(roles, app({ assignedRoleId: 4 })).at(-1)?.label,
    ).toBe("Prensa (inactivo)");
  });
});

describe("reviewShiftGroups", () => {
  it("puts assigned and marked shifts first, in time order, and keeps inactive ones only when assigned", () => {
    const groups = reviewShiftGroups(shifts, {
      availableShiftIds: [4, 1],
      assignedShiftIds: [2],
    });
    expect(groups.primary.map((s) => s.id)).toEqual([1, 2, 4]);
    expect(groups.others.map((s) => s.id)).toEqual([3, 5]);
    expect(
      reviewShiftGroups(shifts, {
        availableShiftIds: [],
        assignedShiftIds: [6],
      }).primary.map((s) => s.id),
    ).toEqual([6]);
  });
});

describe("reviewWarning", () => {
  const pick = (...ids: number[]) => shifts.filter((s) => ids.includes(s.id));

  it("is quiet when the selection is fine", () => {
    expect(reviewWarning(pick(1, 3), [1, 3])).toBeNull();
  });

  it("lets a shift the person did not mark be saved", () => {
    expect(reviewWarning(pick(1, 2), [1])).toBe(
      "El turno del Sáb 19 dic · 10:00–14:00 no lo marcó como disponible. Podés guardar igual.",
    );
  });

  it("warns, without blocking, about a third shift on the same day", () => {
    expect(reviewWarning(pick(2, 3, 4), [2, 3, 4])).toBe(
      "Tiene 3 turnos asignados el sábado 19. El máximo recomendado es 2 por día. Podés guardar igual.",
    );
    expect(reviewWarning(pick(2, 3, 4), [3, 4])).toBe(
      "Tiene 3 turnos asignados el sábado 19 y uno de ellos no lo marcó como disponible. El máximo recomendado es 2 por día. Podés guardar igual.",
    );
    expect(reviewWarning(pick(2, 3, 4), [4])).toBe(
      "Tiene 3 turnos asignados el sábado 19 y 2 de ellos no los marcó como disponibles. El máximo recomendado es 2 por día. Podés guardar igual.",
    );
  });
});

describe("VolunteerReviewForm", () => {
  it("locks the role and shifts until the status is accepted", () => {
    renderForm({ status: "pending" });
    expect(
      screen.getByText("Aceptá la postulación para asignarle un rol y turnos."),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Rol asignado") as HTMLButtonElement).disabled,
    ).toBe(true);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect((checkbox as HTMLButtonElement).disabled).toBe(true);
    }
    expect(
      screen.getByLabelText("Notas internas").getAttribute("placeholder"),
    ).toBe("Solo las ve el equipo de Glitter");
  });

  it("shows the cupo, flags shifts not marked and reveals the rest", () => {
    renderForm({ assignedShiftIds: [2] });
    // Accepted and already on shift 2: the stored assignment is in the count.
    expect(shiftRow(2).getByText("3 de 8")).toBeTruthy();
    expect(shiftRow(2).getByText(/no marcó este turno/)).toBeTruthy();
    expect(shiftRow(1).queryByText(/no marcó este turno/)).toBeNull();
    expect(shiftRow(1).getByText("3 de 8")).toBeTruthy();
    expect(document.querySelector('[data-shift-id="5"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ver el otro turno" }));
    expect(shiftRow(5).getByText(/no marcó este turno/)).toBeTruthy();
    expect(document.querySelector('[data-shift-id="6"]')).toBeNull();

    fireEvent.click(shiftRow(1).getByRole("checkbox"));
    expect(shiftRow(1).getByText("4 de 8")).toBeTruthy();
  });

  it("warns about a third shift in a day but keeps the save enabled", () => {
    renderForm({ assignedShiftIds: [3, 4] });
    expect(saveButton().disabled).toBe(true); // nothing changed yet
    fireEvent.click(screen.getByRole("button", { name: /Ver los otros/ }));
    fireEvent.click(shiftRow(2).getByRole("checkbox"));
    expect(screen.getByRole("status").textContent).toBe(
      "Tiene 3 turnos asignados el sábado 19 y uno de ellos no lo marcó como disponible. El máximo recomendado es 2 por día. Podés guardar igual.",
    );
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(shiftRow(3).getByRole("checkbox"));
    expect(screen.getByRole("status").textContent).toContain(
      "no lo marcó como disponible. Podés guardar igual.",
    );
    expect(saveButton().disabled).toBe(false);
  });

  it("saves status, role, shifts and notes together and refreshes", async () => {
    mocks.save.mockResolvedValue({
      success: true,
      message: "Cambios guardados.",
    });
    renderForm({ assignedRoleId: 3, assignedShiftIds: [1] });
    fireEvent.click(shiftRow(3).getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Notas internas"), {
      target: { value: "Llega tarde el viernes" },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith({
      festivalId: 619,
      applicationId: 42,
      status: "accepted",
      roleId: 3,
      shiftIds: [1, 3],
      adminNotes: "Llega tarde el viernes",
      loadedUpdatedAt: "2026-11-21T14:12:00.123Z",
    });
    expect(mocks.success).toHaveBeenCalledWith("Cambios guardados.");
  });

  it("saves past the per-day limit and shows the action's warning", async () => {
    const warning =
      "Cambios guardados. Quedó con más de 2 turnos el sábado 19 de diciembre.";
    mocks.save.mockResolvedValue({
      success: true,
      message: "Cambios guardados.",
      warning,
    });
    renderForm({ assignedShiftIds: [3, 4] });
    fireEvent.click(screen.getByRole("button", { name: /Ver los otros/ }));
    fireEvent.click(shiftRow(2).getByRole("checkbox"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ shiftIds: [3, 4, 2] }),
    );
    expect(mocks.warning).toHaveBeenCalledWith(warning);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("shows the refusal without refreshing", async () => {
    mocks.save.mockResolvedValue({ success: false, message: "No." });
    renderForm({ adminNotes: "" });
    fireEvent.change(screen.getByLabelText("Notas internas"), {
      target: { value: "Algo" },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("No."));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("keeps the form as typed when someone else changed the application", async () => {
    const stale =
      "Alguien más cambió esta postulación. Actualizá la página para ver los cambios.";
    mocks.save.mockResolvedValue({ success: false, message: stale });
    renderForm({ adminNotes: "" });
    fireEvent.change(screen.getByLabelText("Notas internas"), {
      target: { value: "Algo" },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(stale));
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ loadedUpdatedAt: "2026-11-21T14:12:00.123Z" }),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("Notas internas") as HTMLTextAreaElement).value,
    ).toBe("Algo");
  });

  it("shows the last review under the button", () => {
    renderForm({
      reviewedBy: { id: 7, displayName: "Dennis" },
      reviewedAt: new Date("2026-11-20T18:00:00Z"),
    });
    expect(screen.getByText(/Última revisión: Dennis,/)).toBeTruthy();
  });
});
