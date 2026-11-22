import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type Result = { success: boolean; message: string; warning?: string };

const { assignVolunteersToShift, unassignVolunteerShift, refresh } = vi.hoisted(
  () => ({
    assignVolunteersToShift: vi.fn<(input: unknown) => Promise<Result>>(
      async () => ({ success: true, message: "Asignaste 1 persona." }),
    ),
    unassignVolunteerShift: vi.fn<(input: unknown) => Promise<Result>>(
      async () => ({ success: true, message: "Quitamos a Ana." }),
    ),
    refresh: vi.fn(),
  }),
);
vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  assignVolunteersToShift,
  unassignVolunteerShift,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  }),
}));

import VolunteerShiftAssignScreen from "@/app/components/volunteers/admin/tasks/shift-assign-screen";
import type {
  VolunteerShiftCandidate,
  VolunteerShiftDetail,
} from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerTaskCall } from "@/app/lib/volunteers/admin-task-queries";

beforeAll(() => {
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
  vi.clearAllMocks();
});

type Roles = VolunteerTaskCall["roles"];

function makeRoles(inactive: number[] = []): Roles {
  return ["Acreditación", "Orientación", "Fotografía"].map((name, index) => ({
    id: index + 1,
    name,
    description: "",
    sortOrder: index + 1,
    isActive: !inactive.includes(index + 1),
    choiceCount: 0,
    acceptedCount: 0,
  }));
}

function candidate(
  applicationId: number,
  fullName: string,
): VolunteerShiftCandidate {
  return {
    applicationId,
    fullName,
    status: "accepted",
    firstChoiceRoleId: 1,
    secondChoiceRoleId: 2,
    firstChoiceRoleName: "Acreditación",
    secondChoiceRoleName: "Orientación",
    assignedRoleId: null,
    assignedRoleName: null,
    shiftsThatDay: 0,
  };
}

const ana = candidate(11, "Ana Quispe");
const bruno = candidate(12, "Bruno Mamani");

function makeDetail(
  candidates: VolunteerShiftCandidate[],
): VolunteerShiftDetail {
  return {
    festival: { id: 5, name: "Glitter" },
    shift: {
      id: 40,
      label: "Puerta",
      startsAt: new Date("2026-12-19T14:00:00Z"),
      endsAt: new Date("2026-12-19T18:00:00Z"),
      neededHeadcount: 4,
      sortOrder: 1,
      isActive: true,
      availableCount: candidates.length,
      assignedCount: 0,
      unassignedAvailableCount: candidates.length,
    },
    assignees: [],
    candidates: [...candidates],
  };
}

function screenFor(detail: VolunteerShiftDetail, roles: Roles) {
  return (
    <VolunteerShiftAssignScreen
      festivalId={5}
      detail={detail}
      roles={roles}
      backHref="/asignar"
      reviewHref="/revisar"
    />
  );
}

function checkbox(name: string) {
  return screen.getByRole("checkbox", { name }) as HTMLButtonElement;
}

function roleSelect(person: string) {
  return screen.getByRole("combobox", {
    name: `Rol de ${person}`,
  }) as HTMLButtonElement;
}

function tick(name: string) {
  fireEvent.click(checkbox(name));
}

function pickRole(person: string, role: string) {
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: `Rol de ${person}` }),
    {
      key: "ArrowDown",
    },
  );
  fireEvent.click(screen.getByRole("option", { name: role }));
}

describe("VolunteerShiftAssignScreen", () => {
  it("sends a role only for someone given another one than shown", async () => {
    render(screenFor(makeDetail([ana, bruno]), makeRoles()));
    tick("Ana Quispe");
    tick("Bruno Mamani");
    pickRole("Bruno Mamani", "Fotografía");
    fireEvent.click(screen.getByRole("button", { name: "Asignar 2 personas" }));

    await waitFor(() => expect(assignVolunteersToShift).toHaveBeenCalled());
    expect(assignVolunteersToShift).toHaveBeenCalledWith({
      festivalId: 5,
      shiftId: 40,
      people: [{ applicationId: 11 }, { applicationId: 12, roleId: 3 }],
    });
  });

  it("drops picks a refresh no longer shows: the person, or a role deactivated meanwhile", async () => {
    const { rerender } = render(
      screenFor(makeDetail([ana, bruno]), makeRoles()),
    );
    tick("Ana Quispe");
    tick("Bruno Mamani");
    pickRole("Bruno Mamani", "Fotografía");

    // Ana was assigned elsewhere and Fotografía deactivated.
    rerender(screenFor(makeDetail([bruno]), makeRoles([3])));
    expect(roleSelect("Bruno Mamani").textContent).toContain(
      "Acreditación (1ª)",
    );
    fireEvent.click(screen.getByRole("button", { name: "Asignar 1 persona" }));

    await waitFor(() => expect(assignVolunteersToShift).toHaveBeenCalled());
    expect(assignVolunteersToShift).toHaveBeenCalledWith(
      expect.objectContaining({ people: [{ applicationId: 12 }] }),
    );
  });

  it("keeps the picks across a refresh that still shows them", () => {
    const { rerender } = render(
      screenFor(makeDetail([ana, bruno]), makeRoles()),
    );
    tick("Bruno Mamani");
    pickRole("Bruno Mamani", "Fotografía");
    rerender(screenFor(makeDetail([ana, bruno]), makeRoles()));
    expect(checkbox("Bruno Mamani").getAttribute("aria-checked")).toBe("true");
    expect(roleSelect("Bruno Mamani").textContent).toContain("Fotografía");
  });

  it("locks the rows while saving and clears the picks once saved", async () => {
    let finish: (result: Result) => void = () => {};
    assignVolunteersToShift.mockImplementationOnce(
      () => new Promise<Result>((resolve) => (finish = resolve)),
    );
    render(screenFor(makeDetail([ana, bruno]), makeRoles()));
    tick("Ana Quispe");
    fireEvent.click(screen.getByRole("button", { name: "Asignar 1 persona" }));

    await waitFor(() => expect(checkbox("Bruno Mamani").disabled).toBe(true));
    expect(roleSelect("Ana Quispe").disabled).toBe(true);

    finish({ success: true, message: "Asignaste 1 persona." });
    await waitFor(() =>
      expect(checkbox("Ana Quispe").getAttribute("aria-checked")).toBe("false"),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the picks when the save is refused", async () => {
    assignVolunteersToShift.mockResolvedValueOnce({
      success: false,
      message: "Ana Quispe ya no puede cubrir este turno. Actualizá la página.",
    });
    render(screenFor(makeDetail([ana, bruno]), makeRoles()));
    tick("Ana Quispe");
    fireEvent.click(screen.getByRole("button", { name: "Asignar 1 persona" }));

    await waitFor(() => expect(assignVolunteersToShift).toHaveBeenCalled());
    await waitFor(() => expect(checkbox("Ana Quispe").disabled).toBe(false));
    expect(checkbox("Ana Quispe").getAttribute("aria-checked")).toBe("true");
    expect(refresh).not.toHaveBeenCalled();
  });
});
