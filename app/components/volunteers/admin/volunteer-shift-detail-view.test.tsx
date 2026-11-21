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

const { refresh, assign, unassign, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  assign: vi.fn(),
  unassign: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => "/dashboard/festivals/11/volunteers/shifts/3",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  assignVolunteerShift: assign,
  unassignVolunteerShift: unassign,
  updateVolunteerApplicationStatus: vi.fn(),
}));

import VolunteerShiftDetailView, {
  availableSentence,
  candidateDayLine,
} from "@/app/components/volunteers/admin/volunteer-shift-detail-view";
import { volunteerCoverageHref } from "@/app/components/volunteers/admin/volunteer-admin-list-params";
import type {
  VolunteerShiftAssignee,
  VolunteerShiftCandidate,
  VolunteerShiftDetail,
} from "@/app/lib/volunteers/admin-definitions";

function assignee(
  id: number,
  overrides: Partial<VolunteerShiftAssignee> = {},
): VolunteerShiftAssignee {
  return {
    applicationId: id,
    fullName: `Asignada ${id}`,
    status: "accepted",
    assignedRoleName: "Fotografía y redes sociales",
    ...overrides,
  };
}

function candidate(
  id: number,
  overrides: Partial<VolunteerShiftCandidate> = {},
): VolunteerShiftCandidate {
  return {
    applicationId: id,
    fullName: `Candidata ${id}`,
    status: "accepted",
    firstChoiceRoleName: "Orientación al público",
    secondChoiceRoleName: "Apoyo a expositores",
    shiftsThatDay: 0,
    ...overrides,
  };
}

function detail(
  overrides: Partial<VolunteerShiftDetail> = {},
): VolunteerShiftDetail {
  return {
    festival: { id: 11, name: "Glitter v11" },
    shift: {
      id: 3,
      label: "Festival (turno A)",
      // 17:30 UTC is 13:30 in La Paz.
      startsAt: new Date("2026-12-19T17:30:00Z"),
      endsAt: new Date("2026-12-19T21:30:00Z"),
      neededHeadcount: 10,
      sortOrder: 3,
      isActive: true,
      availableCount: 29,
      assignedCount: 7,
    },
    assignees: [assignee(1), assignee(2, { assignedRoleName: null })],
    candidates: [
      candidate(10, { fullName: "Hernán" }),
      candidate(11, { fullName: "Ana", status: "pending" }),
      candidate(12, { fullName: "Carla", shiftsThatDay: 2 }),
      candidate(13, { fullName: "Dani", status: "waitlist", shiftsThatDay: 1 }),
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("candidateDayLine", () => {
  it("words the day and the auto-accept note", () => {
    expect(candidateDayLine({ status: "accepted", shiftsThatDay: 0 })).toEqual({
      text: "Sin turnos este día",
      warning: false,
    });
    expect(
      candidateDayLine({ status: "accepted", shiftsThatDay: 1 }).text,
    ).toBe("Ya tiene 1 turno este día");
    expect(candidateDayLine({ status: "accepted", shiftsThatDay: 2 })).toEqual({
      text: "Ya tiene 2 turnos este día. Podés asignar igual.",
      warning: true,
    });
    expect(
      candidateDayLine({ status: "pending", shiftsThatDay: 0 }, true).text,
    ).toBe("Sin turnos este día. Al asignar pasa a Aceptada.");
    expect(
      candidateDayLine({ status: "waitlist", shiftsThatDay: 3 }, true).text,
    ).toBe(
      "Ya tiene 3 turnos este día. Podés asignar igual. Al asignar pasa a Aceptada.",
    );
    expect(
      candidateDayLine({ status: "pending", shiftsThatDay: 0 }, false).text,
    ).toBe(
      "Sin turnos este día. Aceptá la postulación para asignarle un rol y turnos.",
    );
  });

  it("counts the people who marked it", () => {
    expect(availableSentence(1)).toBe(
      "1 persona marcó este turno como disponible.",
    );
    expect(availableSentence(29)).toBe(
      "29 personas marcaron este turno como disponible.",
    );
  });

  it("leads phones back to the list's Cobertura view", () => {
    expect(volunteerCoverageHref(11)).toBe(
      "/dashboard/festivals/11/volunteers?view=cobertura",
    );
  });
});

describe("VolunteerShiftDetailView", () => {
  it("shows the shift, its coverage and both lists", () => {
    render(<VolunteerShiftDetailView detail={detail()} autoAccept />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Sáb 19 dic · 13:30–17:30",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Festival (turno A)")).toBeTruthy();
    expect(screen.queryByText("Inactivo")).toBeNull();

    const cover = within(
      screen.getByRole("region", { name: "Cobertura del turno" }),
    );
    expect(cover.getByText("7 de 10 asignados")).toBeTruthy();
    expect(cover.getByText("Faltan 3")).toBeTruthy();
    expect(
      cover.getByRole("progressbar", { name: "7 de 10 asignados" }),
    ).toBeTruthy();
    expect(
      cover.getByText("29 personas marcaron este turno como disponible."),
    ).toBeTruthy();

    const assigned = within(
      screen.getByRole("region", { name: "Asignados (2)" }),
    );
    expect(
      assigned.getByRole("link", { name: "Asignada 1" }).getAttribute("href"),
    ).toBe("/dashboard/festivals/11/volunteers/1");
    expect(assigned.getByText("Fotografía y redes sociales")).toBeTruthy();
    expect(assigned.getByText("Sin rol")).toBeTruthy();
    expect(
      assigned.getByRole("button", {
        name: "Quitar a Asignada 1 de este turno",
      }),
    ).toBeTruthy();

    const candidates = within(
      screen.getByRole("region", { name: "Pueden cubrirlo (4)" }),
    );
    expect(
      candidates.getByText(
        "Marcaron este turno y todavía no están asignados a él.",
      ),
    ).toBeTruthy();
    const rows = candidates.getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    const ana = within(rows[1]!);
    expect(ana.getByText("Pendiente")).toBeTruthy();
    expect(
      ana.getByText("1ª Orientación al público · 2ª Apoyo a expositores"),
    ).toBeTruthy();
    expect(
      ana.getByText("Sin turnos este día. Al asignar pasa a Aceptada."),
    ).toBeTruthy();
    expect(
      within(rows[2]!).getByText(
        "Ya tiene 2 turnos este día. Podés asignar igual.",
      ),
    ).toBeTruthy();
    expect(
      within(rows[3]!).getByText(
        "Ya tiene 1 turno este día. Al asignar pasa a Aceptada.",
      ),
    ).toBeTruthy();
  });

  it("marks assignees that are not accepted with their status", () => {
    render(
      <VolunteerShiftDetailView
        detail={detail({
          assignees: [assignee(1), assignee(2, { status: "waitlist" })],
        })}
      />,
    );
    const rows = within(
      screen.getByRole("region", { name: "Asignados (2)" }),
    ).getAllByRole("listitem");
    expect(within(rows[0]!).queryByText("Aceptada")).toBeNull();
    expect(within(rows[1]!).getByText("En espera")).toBeTruthy();
  });

  it("filters the candidates by status with counted chips", () => {
    render(<VolunteerShiftDetailView detail={detail()} />);
    const region = within(
      screen.getByRole("region", { name: "Pueden cubrirlo (4)" }),
    );
    const chips = within(
      region.getByRole("group", { name: "Estado de quienes pueden cubrirlo" }),
    ).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Todos 4",
      "Aceptadas 2",
      "Pendientes 1",
      "En espera 1",
    ]);
    expect(chips[0]!.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(chips[1]!);
    expect(chips[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(chips[0]!.getAttribute("aria-pressed")).toBe("false");
    expect(
      region
        .getAllByRole("listitem")
        .map((row) => within(row).getByRole("link").textContent),
    ).toEqual(["Hernán", "Carla"]);

    fireEvent.click(chips[3]!);
    expect(
      region
        .getAllByRole("listitem")
        .map((row) => within(row).getByRole("link").textContent),
    ).toEqual(["Dani"]);
  });

  it("shows the first rows and the rest on demand", () => {
    render(
      <VolunteerShiftDetailView
        detail={detail({
          assignees: Array.from({ length: 7 }, (_, i) => assignee(i + 1)),
          candidates: Array.from({ length: 10 }, (_, i) => candidate(i + 20)),
        })}
      />,
    );
    const assigned = within(
      screen.getByRole("region", { name: "Asignados (7)" }),
    );
    expect(assigned.getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(
      assigned.getByRole("button", { name: "Ver los 7 asignados" }),
    );
    expect(assigned.getAllByRole("listitem")).toHaveLength(7);
    expect(assigned.queryByRole("button", { name: /Ver los/ })).toBeNull();

    const candidates = within(
      screen.getByRole("region", { name: "Pueden cubrirlo (10)" }),
    );
    expect(candidates.getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(candidates.getByRole("button", { name: "Ver los 10" }));
    expect(candidates.getAllByRole("listitem")).toHaveLength(10);
  });

  it("says when nobody is assigned or could cover it", () => {
    render(
      <VolunteerShiftDetailView
        detail={detail({ assignees: [], candidates: [] })}
      />,
    );
    expect(
      screen.getByText("Todavía no hay nadie asignado a este turno."),
    ).toBeTruthy();
    expect(screen.getByText("Nadie más marcó este turno.")).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("assigns and removes, then toasts and refreshes", async () => {
    assign.mockResolvedValue({
      success: true,
      message: "Turno asignado a Hernán.",
    });
    unassign.mockResolvedValue({
      success: true,
      message: "Quitamos a Asignada 1 de este turno.",
    });
    render(<VolunteerShiftDetailView detail={detail()} />);

    fireEvent.click(screen.getByRole("button", { name: "Asignar a Hernán" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith({
      festivalId: 11,
      shiftId: 3,
      applicationId: 10,
    });
    expect(toast.success).toHaveBeenCalledWith("Turno asignado a Hernán.");

    fireEvent.click(
      screen.getByRole("button", { name: "Quitar a Asignada 1 de este turno" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(unassign).toHaveBeenCalledWith({
      festivalId: 11,
      shiftId: 3,
      applicationId: 1,
    });
  });

  it("toasts the action's warning or refusal", async () => {
    assign.mockResolvedValueOnce({
      success: true,
      message: "Turno asignado a Carla.",
      warning: "Carla queda con 3 turnos el sábado 19.",
    });
    render(<VolunteerShiftDetailView detail={detail()} />);
    fireEvent.click(screen.getByRole("button", { name: "Asignar a Carla" }));
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "Carla queda con 3 turnos el sábado 19.",
      ),
    );

    assign.mockResolvedValueOnce({
      success: false,
      message: "Ese turno está desactivado.",
    });
    fireEvent.click(screen.getByRole("button", { name: "Asignar a Ana" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ese turno está desactivado."),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("disables Asignar on an inactive shift, and on unaccepted ones without auto-accept", () => {
    const { unmount } = render(
      <VolunteerShiftDetailView
        detail={detail({ shift: { ...detail().shift, isActive: false } })}
      />,
    );
    expect(screen.getByText("Inactivo")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Asignar a Hernán",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    unmount();

    render(<VolunteerShiftDetailView detail={detail()} autoAccept={false} />);
    expect(
      (
        screen.getByRole("button", {
          name: "Asignar a Ana",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Asignar a Hernán",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(screen.queryByText(/Al asignar pasa a Aceptada/)).toBeNull();
  });
});
