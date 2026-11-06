// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
vi.mock(
  "@/app/components/festivals/reservations/partner-selection",
  () => ({ default: () => null }),
);

import HoldConfirmationClient from "@/app/components/festivals/reservations/hold-confirmation-client";
import {
  AppScreenBar,
  ScreenBarProvider,
} from "@/app/components/navbar/screen-bar";

const MAP_URL = "/profiles/3/festivals/10/reservations/new";

function renderConfirm(options: { fullTable?: boolean } = {}) {
  const isFullTable = options.fullTable ?? false;
  return render(
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
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
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
    </ScreenBarProvider>,
  );
}

beforeEach(() => {
  pathname.mockReturnValue("/profiles/3/festivals/10/reservations/new/sectors/7/confirm/55");
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

  it("goes back to the map from \"Volver al mapa\" and keeps the hold", () => {
    renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Volver al mapa" }));
    expect(replace).toHaveBeenCalledWith(MAP_URL);
    expect(cancelStandHold).not.toHaveBeenCalled();
  });

  it("asks before releasing, and keeps the hold on \"Seguir con mi reserva\"", () => {
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

  it("releases the hold on \"Liberar\"", async () => {
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
});
