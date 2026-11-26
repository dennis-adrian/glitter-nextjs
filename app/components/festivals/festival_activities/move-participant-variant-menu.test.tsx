import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  move: vi.fn(),
  retry: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/lib/festival_activites/admin-actions", () => ({
  moveActivityParticipant: mocks.move,
  retryWaitlistInvitation: mocks.retry,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

import { toast } from "sonner";
import MoveParticipantVariantMenu, {
  type MoveTargetVariant,
} from "./move-participant-variant-menu";

const NOW = new Date("2026-10-01T15:00:00.000Z").getTime();

function variant(
  id: number,
  overrides: Partial<MoveTargetVariant> = {},
): MoveTargetVariant {
  return {
    id,
    label: `Variante ${id}`,
    activeCount: 1,
    reservationExpiries: [],
    participationLimit: null,
    category: null,
    ...overrides,
  };
}

function renderMenu(variants: MoveTargetVariant[]) {
  return render(
    <MoveParticipantVariantMenu
      activityId={9}
      participationId={77}
      participantName="Ana"
      participantCategory="illustration"
      currentDetailId={1}
      variants={variants}
    />,
  );
}

function openMenu() {
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Mover a Ana a otra variante" }),
    { key: "Enter" },
  );
}

function itemFor(label: string) {
  return screen.getByRole("menuitem", { name: new RegExp(label) });
}

/** The options of the last success toast, whose title was `title`. */
function lastSuccessToast(title: string) {
  const calls = vi.mocked(toast.success).mock.calls;
  const call = calls.findLast(([message]) => message === title);
  if (!call) throw new Error(`No toast titled "${title}"`);
  return call[1] as {
    description?: ReactElement | string;
    action?: { label: string; onClick: () => void };
  };
}

describe("MoveParticipantVariantMenu", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("recounts invitations when it opens, so an expired one frees the seat", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    renderMenu([
      variant(1),
      variant(2, {
        activeCount: 1,
        participationLimit: 2,
        reservationExpiries: [NOW + 60_000],
      }),
    ]);

    openMenu();
    expect(itemFor("Variante 2").hasAttribute("data-disabled")).toBe(true);
    expect(itemFor("Variante 2").textContent).toContain(
      "Sin cupos (invitaciones)",
    );

    fireEvent.keyDown(itemFor("Variante 2"), { key: "Escape" });
    expect(screen.queryByRole("menuitem")).toBeNull();
    vi.setSystemTime(NOW + 61_000);
    openMenu();

    expect(itemFor("Variante 2").hasAttribute("data-disabled")).toBe(false);
    expect(itemFor("Variante 2").textContent).toContain("1/2");
    expect(itemFor("Variante 2").textContent).not.toContain("invitado");
  });

  it("treats a limit of 0 as no limit, as the server does", () => {
    renderMenu([
      variant(1),
      variant(2, { activeCount: 3, participationLimit: 0 }),
    ]);

    openMenu();

    expect(itemFor("Variante 2").hasAttribute("data-disabled")).toBe(false);
    expect(itemFor("Variante 2").textContent).toMatch(/3$/);
    expect(itemFor("Variante 2").textContent).not.toContain("/0");
  });

  it("undoes with the move's revision", async () => {
    mocks.move.mockResolvedValue({
      success: true,
      message: "ok",
      revision: "2026-10-01T15:00:00.123Z",
    });
    renderMenu([variant(1), variant(2)]);

    openMenu();
    fireEvent.click(itemFor("Variante 2"));
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Ana ahora está en Variante 2",
        expect.anything(),
      ),
    );
    expect(mocks.move).toHaveBeenCalledWith(77, 2, {
      expectedSourceDetailId: 1,
      undo: undefined,
    });

    const { action } = lastSuccessToast("Ana ahora está en Variante 2");
    expect(action?.label).toBe("Deshacer");
    action?.onClick();

    await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2));
    expect(mocks.move).toHaveBeenLastCalledWith(77, 1, {
      expectedSourceDetailId: 2,
      undo: { revision: "2026-10-01T15:00:00.123Z" },
    });
  });

  it("offers to retry a failed invitation without moving anyone again", async () => {
    mocks.move.mockResolvedValue({
      success: true,
      message: "ok",
      invitationFailed: true,
      revision: "2026-10-01T15:00:00.123Z",
    });
    mocks.retry.mockResolvedValue({
      success: true,
      message: "Se invitó a Bea de la lista de espera",
      invitedName: "Bea",
    });
    renderMenu([variant(1), variant(2)]);

    openMenu();
    fireEvent.click(itemFor("Variante 2"));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());

    const { description, action } = lastSuccessToast(
      "Ana ahora está en Variante 2",
    );
    // Undo stays on offer: no invitation holds the freed seat.
    expect(action?.label).toBe("Deshacer");
    cleanup();
    render(description as ReactElement);
    screen.getByText("No se pudo enviar la invitación a la lista de espera.");

    mocks.refresh.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar invitación" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar invitación" }),
    );

    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Se invitó a Bea de la lista de espera",
      ),
    );
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(mocks.retry).toHaveBeenCalledWith(9, 1);
    expect(mocks.move).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("reports a retry that still finds nobody to invite", async () => {
    mocks.move.mockResolvedValue({
      success: true,
      message: "ok",
      invitationFailed: true,
      revision: "2026-10-01T15:00:00.123Z",
    });
    mocks.retry.mockResolvedValue({
      success: false,
      message: "No se pudo enviar la invitación. Intentá nuevamente.",
    });
    renderMenu([variant(1), variant(2)]);

    openMenu();
    fireEvent.click(itemFor("Variante 2"));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    const { description } = lastSuccessToast("Ana ahora está en Variante 2");
    cleanup();
    render(description as ReactElement);
    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar invitación" }),
    );

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se pudo enviar la invitación. Intentá nuevamente.",
      ),
    );
    expect(mocks.move).toHaveBeenCalledTimes(1);
  });

  it("caps its height to the space on screen and scrolls", () => {
    renderMenu([variant(1), variant(2)]);

    openMenu();

    const { classList } = screen.getByRole("menu");
    expect(classList).toContain(
      "max-h-[var(--radix-dropdown-menu-content-available-height)]",
    );
    expect(classList).toContain("overflow-y-auto");
  });
});
