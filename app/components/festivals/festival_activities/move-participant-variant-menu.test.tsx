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
import { STALE_DEPLOYMENT_MESSAGE } from "@/app/lib/errors/action-error";
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
    id?: string;
    duration?: number;
    dismissible?: boolean;
    description?: ReactElement | string;
    action?: { label: string; onClick: () => void };
  };
}

const MOVED = "Ana ahora está en Variante 2";
const REVISION = "2026-10-01T15:00:00.123Z";

function retryButton() {
  return screen.getByRole("button", { name: "Reintentar invitación" });
}

/** Moves Ana to Variante 2, whose invitation fails, and shows that toast. */
async function moveWithFailedInvitation() {
  mocks.move.mockResolvedValue({
    success: true,
    message: "ok",
    invitationFailed: true,
    revision: REVISION,
  });
  renderMenu([variant(1), variant(2)]);
  openMenu();
  fireEvent.click(itemFor("Variante 2"));
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
  const shown = lastSuccessToast(MOVED);
  cleanup();
  render(shown.description as ReactElement);
  return shown;
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

  it("keeps the toast up while a retry sends, then reports the invitation", async () => {
    let send!: (result: unknown) => void;
    mocks.retry.mockReturnValue(
      new Promise((resolve) => {
        send = resolve;
      }),
    );
    const shown = await moveWithFailedInvitation();
    // Undo stays on offer: no invitation holds the freed seat.
    expect(shown.action?.label).toBe("Deshacer");
    screen.getByText("No se pudo enviar la invitación a la lista de espera.");

    mocks.refresh.mockClear();
    fireEvent.click(retryButton());
    fireEvent.click(retryButton());

    // The same toast reports the attempt, pinned, without retry or Deshacer.
    // Strict: sonner merges an update into the toast, so only an explicit
    // `action: undefined` takes Deshacer off it.
    expect(lastSuccessToast(MOVED)).toStrictEqual({
      id: shown.id,
      duration: Infinity,
      dismissible: false,
      description: "Enviando invitación…",
      action: undefined,
    });
    expect(toast.dismiss).not.toHaveBeenCalled();

    send({
      success: true,
      message: "Se invitó a Bea de la lista de espera",
      invitedName: "Bea",
    });
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Se invitó a Bea de la lista de espera",
      ),
    );
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(mocks.retry).toHaveBeenCalledWith(9, 1);
    expect(mocks.move).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).toHaveBeenCalledOnce();
    expect(toast.dismiss).toHaveBeenCalledWith(shown.id);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it.each([
    {
      outcome: "finds nobody to invite",
      failRetry: () =>
        mocks.retry.mockResolvedValue({
          success: false,
          message: "No hay a quién invitar",
        }),
      message: "No hay a quién invitar",
    },
    {
      outcome: "throws",
      failRetry: () => mocks.retry.mockRejectedValue(new Error("offline")),
      message: "No se pudo enviar la invitación. Intentá nuevamente.",
    },
  ])(
    "offers the retry and Deshacer again when a retry $outcome",
    async ({ failRetry, message }) => {
      failRetry();
      const shown = await moveWithFailedInvitation();

      fireEvent.click(retryButton());
      await vi.waitFor(() => expect(mocks.retry).toHaveBeenCalledOnce());
      await vi.waitFor(() =>
        expect(lastSuccessToast(MOVED).description).not.toBe(
          "Enviando invitación…",
        ),
      );

      const reshown = lastSuccessToast(MOVED);
      expect(reshown).toMatchObject({
        id: shown.id,
        duration: undefined,
        dismissible: true,
        action: { label: "Deshacer" },
      });
      expect(toast.dismiss).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      cleanup();
      render(reshown.description as ReactElement);
      screen.getByText(message);

      const shownBeforeSecond = vi.mocked(toast.success).mock.calls.length;
      fireEvent.click(retryButton());
      await vi.waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(2));
      // The second failure restores the toast too: not stuck on "Enviando".
      await vi.waitFor(() => {
        expect(vi.mocked(toast.success).mock.calls.length).toBeGreaterThan(
          shownBeforeSecond + 1,
        );
        expect(lastSuccessToast(MOVED).description).not.toBe(
          "Enviando invitación…",
        );
      });

      // Undo from the toast as it stands now, not the one shown earlier.
      lastSuccessToast(MOVED).action?.onClick();
      await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2));
      expect(mocks.move).toHaveBeenLastCalledWith(77, 1, {
        expectedSourceDetailId: 2,
        undo: { revision: REVISION },
      });
    },
  );

  it("shows the reload notice instead of the retry when the tab is stale", async () => {
    const stale = new Error("Server Action not found");
    stale.name = "UnrecognizedActionError";
    mocks.retry.mockRejectedValue(stale);
    const shown = await moveWithFailedInvitation();

    fireEvent.click(retryButton());

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        STALE_DEPLOYMENT_MESSAGE,
        expect.objectContaining({
          action: expect.objectContaining({ label: "Recargar" }),
        }),
      ),
    );
    expect(toast.dismiss).toHaveBeenCalledWith(shown.id);
    // Neither the retry nor Deshacer comes back: both would fail the same way.
    expect(lastSuccessToast(MOVED).description).toBe("Enviando invitación…");
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
