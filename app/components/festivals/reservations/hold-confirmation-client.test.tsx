// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cancelStandHold, confirmStandHold, replace, pathname, toast } =
  vi.hoisted(() => ({
    cancelStandHold: vi.fn(),
    confirmStandHold: vi.fn(),
    replace: vi.fn(),
    pathname: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  }));

// The actions are "use server" modules that import `server-only`, which
// throws outside a server build.
vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/stands/hold-actions", () => ({
  cancelStandHold,
  confirmStandHold,
}));
vi.mock("@/app/lib/reservations/participant-actions", () => ({
  searchPotentialPartners: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/app/lib/posthog-capture", () => ({ captureClientEvent: vi.fn() }));
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  usePathname: pathname,
  useRouter: () => ({ replace, back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/components/festivals/reservations/partner-selection", () => ({
  default: () => null,
}));

import HoldConfirmationClient from "@/app/components/festivals/reservations/hold-confirmation-client";
import { remainingSecondsAt } from "@/app/components/festivals/reservations/use-hold-countdown";
import {
  AppScreenBar,
  ScreenBarProvider,
} from "@/app/components/navbar/screen-bar";

const MAP_URL = "/profiles/3/festivals/10/reservations/new";

type ConfirmOptions = {
  fullTable?: boolean;
  expiresAt?: string;
  serverNow?: string;
};

function renderConfirm(options: ConfirmOptions = {}) {
  return render(confirmScreen(options));
}

function confirmScreen(options: ConfirmOptions = {}) {
  const isFullTable = options.fullTable ?? false;
  const serverNow = options.serverNow ?? new Date().toISOString();
  return (
    <ScreenBarProvider>
      <AppScreenBar
        screen={{
          title: "Confirmar reserva",
          parentHref: "/my_participations",
          close: false,
          toParent: false,
        }}
      />
      <HoldConfirmationClient
        recentPartners={[]}
        hold={{
          id: 55,
          expiresAt:
            options.expiresAt ??
            new Date(Date.parse(serverNow) + 5 * 60_000).toISOString(),
          serverNow,
        }}
        fullTable={{
          isFullTable,
          standLabels: isFullTable ? ["A1", "A2"] : ["A1"],
          standIds: isFullTable ? [21, 22] : [21],
        }}
        stand={{
          id: 21,
          label: "A",
          standNumber: 1,
          standCategory: "illustration",
          price: 350,
          sharedPrice: null,
        }}
        sectorName="Sector A"
        sectorStands={[
          {
            id: 21,
            status: "held",
            positionLeft: 0,
            positionTop: 0,
            label: "A",
            standNumber: 1,
          },
        ]}
        mapBounds={{ minX: 0, minY: 0, width: 10, height: 10 }}
        festival={{ id: 10, name: "Glitter" }}
        profile={{
          id: 3,
          displayName: "Ada",
          category: "illustration",
          imageUrl: null,
        }}
        sectorId={7}
      />
    </ScreenBarProvider>
  );
}

beforeEach(() => {
  pathname.mockReturnValue(
    "/profiles/3/festivals/10/reservations/new/sectors/7/confirm/55",
  );
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HoldConfirmationClient", () => {
  it("goes back to the map from the top bar and keeps the hold", () => {
    renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(replace).toHaveBeenCalledWith(MAP_URL);
    expect(cancelStandHold).not.toHaveBeenCalled();
  });

  it('goes back to the map from "Volver al mapa" and keeps the hold', () => {
    renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Volver al mapa" }));
    expect(replace).toHaveBeenCalledWith(MAP_URL);
    expect(cancelStandHold).not.toHaveBeenCalled();
  });

  it('asks before releasing, and keeps the hold on "Seguir con mi reserva"', () => {
    renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("¿Liberar el stand A1?");
    expect(dialog.textContent).toContain("Otra persona podrá reservarlo.");

    fireEvent.click(
      screen.getByRole("button", { name: "Seguir con mi reserva" }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(cancelStandHold).not.toHaveBeenCalled();
  });

  it("names both stands of a full table", () => {
    renderConfirm({ fullTable: true });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("¿Liberar los stands A1 y A2?");
    expect(dialog.textContent).toContain("Otra persona podrá reservarlos.");
  });

  it('releases the hold on "Liberar"', async () => {
    cancelStandHold.mockResolvedValue({
      success: true,
      message: "Reserva temporal cancelada",
    });
    renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Liberar" }));

    await waitFor(() => expect(cancelStandHold).toHaveBeenCalledWith(55));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(MAP_URL));
  });

  it("keeps a partner refusal on screen for eight seconds", async () => {
    confirmStandHold.mockResolvedValue({
      success: false,
      code: "PARTNER_NOT_ELIGIBLE",
      message: "Tu compañero no puede participar",
    });
    renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar Reserva/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Tu compañero no puede participar",
        { duration: 8000 },
      ),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps any other refusal on screen for eight seconds and returns to the map", async () => {
    confirmStandHold.mockResolvedValue({
      success: false,
      code: "HOLD_EXPIRED",
      message: "Tu reserva temporal expiró",
    });
    renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar Reserva/ }));

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith("Tu reserva temporal expiró", {
        duration: 8000,
      }),
    );
    expect(replace).toHaveBeenCalledWith(MAP_URL);
  });

  describe("countdown", () => {
    const T = Date.UTC(2026, 10, 7, 0, 0, 0);
    const at = (ms: number) => new Date(T + ms).toISOString();

    beforeEach(() => {
      vi.useFakeTimers({
        toFake: [
          "Date",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
        ],
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      delete (document as { visibilityState?: unknown }).visibilityState;
    });

    const advance = (ms: number) =>
      act(() => {
        vi.advanceTimersByTime(ms);
      });

    it("counts the server's time on a phone five minutes fast and never cancels", () => {
      vi.setSystemTime(T + 5 * 60_000);
      renderConfirm({ serverNow: at(0), expiresAt: at(3 * 60_000) });

      expect(screen.getByText("3:00")).toBeTruthy();
      advance(0);
      expect(screen.getByText("3:00")).toBeTruthy();
      expect(replace).not.toHaveBeenCalled();
      expect(cancelStandHold).not.toHaveBeenCalled();

      advance(180_000);
      expect(screen.getByText("0:00")).toBeTruthy();
    });

    it("returns to the map at 0:00 without a server round trip", () => {
      vi.setSystemTime(T);
      renderConfirm({ serverNow: at(0), expiresAt: at(10_000) });

      advance(10_000);
      expect(toast.info).toHaveBeenCalledWith("Tu reserva temporal expiró", {
        duration: 8000,
      });
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith(MAP_URL);
      advance(5_000);
      expect(replace).toHaveBeenCalledTimes(1);
      expect(cancelStandHold).not.toHaveBeenCalled();
    });

    it("catches up when a backgrounded tab becomes visible", () => {
      vi.setSystemTime(T);
      renderConfirm({ serverNow: at(0), expiresAt: at(3 * 60_000) });
      advance(0);

      // Background timers stall: move the clock without firing them.
      vi.setSystemTime(T + 4 * 60_000);
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(screen.getByText("0:00")).toBeTruthy();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith(MAP_URL);
    });

    it("lets a confirm pending at 0:00 land on payments, once", async () => {
      vi.setSystemTime(T);
      let resolveConfirm!: (value: unknown) => void;
      confirmStandHold.mockImplementation(
        () => new Promise((resolve) => (resolveConfirm = resolve)),
      );
      renderConfirm({ serverNow: at(0), expiresAt: at(5_000) });
      advance(3_000);
      fireEvent.click(
        screen.getByRole("button", { name: /Confirmar Reserva/ }),
      );

      advance(5_000);
      expect(replace).not.toHaveBeenCalled();

      await act(async () => {
        resolveConfirm({
          success: true,
          message: "Reserva confirmada",
          data: { reservationId: 88 },
        });
      });
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith(
        "/profiles/3/festivals/10/reservations/88/payments",
      );
    });

    it("hydrates a hard reload without a mismatch on a skewed phone", async () => {
      // Server rendered with 3:00 left; the phone's clock reads 5 min later.
      vi.setSystemTime(T + 5 * 60_000);
      const options = { serverNow: at(0), expiresAt: at(3 * 60_000) };
      const html = renderToString(confirmScreen(options));
      expect(html).toContain("3:00");

      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);
      const onRecoverableError = vi.fn();
      const root = await act(async () =>
        hydrateRoot(container, confirmScreen(options), { onRecoverableError }),
      );
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.textContent).toContain("3:00");
      act(() => root.unmount());
      container.remove();
    });
  });
});

describe("remainingSecondsAt", () => {
  it("rounds a partial second up and floors at zero", () => {
    expect(remainingSecondsAt(10_000, 0)).toBe(10);
    expect(remainingSecondsAt(10_000, 1)).toBe(10);
    expect(remainingSecondsAt(10_000, 9_001)).toBe(1);
    expect(remainingSecondsAt(10_000, 10_000)).toBe(0);
    expect(remainingSecondsAt(10_000, 60_000)).toBe(0);
  });

  it("treats an unparsable time as expired", () => {
    expect(remainingSecondsAt(Number.NaN, 0)).toBe(0);
    expect(remainingSecondsAt(10_000, Number.NaN)).toBe(0);
  });
});
