// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ReservationActiveHoldDto,
  ReservationMapStandDto,
} from "@/app/lib/reservations/dto";
import type { StandStatusPollResult } from "@/app/lib/stands/status-poll";

const createStandHold = vi.hoisted(() => vi.fn());
const pollNow = vi.hoisted(() => vi.fn());
const pollCallback = vi.hoisted(() => ({
  current: null as null | ((result: StandStatusPollResult) => void),
}));

vi.mock("server-only", () => ({}));
// Only `createStandHold` exists: a mount-time hold lookup would throw here.
vi.mock("@/app/lib/stands/hold-actions", () => ({ createStandHold }));
vi.mock("@/app/lib/reservations/full-table-actions", () => ({
  activateFullTableAccessAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/hooks/use-stand-polling", () => ({
  useStandPolling: (
    _sectorId: number | null,
    _interval: number,
    onUpdate: (result: StandStatusPollResult) => void,
  ) => {
    pollCallback.current = onUpdate;
    return { stale: false, pollNow };
  },
}));
vi.mock("@/app/components/maps/user/user-map", () => ({
  default: ({
    stands,
    onStandClick,
  }: {
    stands: ReservationMapStandDto[];
    onStandClick?: (stand: ReservationMapStandDto) => void;
  }) => (
    <div data-testid="map-background">
      <button type="button">Acercar</button>
      {stands.map((stand) => (
        <button
          key={stand.id}
          type="button"
          onClick={() => onStandClick?.(stand)}
        >
          {`stand-${stand.label}`}
        </button>
      ))}
    </div>
  ),
}));

import ClientMap from "@/app/components/festivals/client-map";

function stand(
  id: number,
  label: string,
  overrides: Partial<ReservationMapStandDto> = {},
): ReservationMapStandDto {
  return {
    id,
    label,
    standNumber: id,
    effectiveStatus: "held",
    status: "held",
    positionLeft: 0,
    positionTop: 0,
    width: 4,
    height: 4,
    standCategory: "illustration",
    participationType: "standard",
    price: 350,
    sharedPrice: null,
    eligibleSubcategoryIds: [],
    festivalSectorId: 7,
    standGroupId: 8,
    isFullTableHalf: true,
    occupantKey: null,
    hasExternalOccupant: false,
    visibleParticipantSummaries: [],
    ...overrides,
  };
}

const stands = [stand(21, "A1"), stand(22, "A2")];

function renderMap(
  activeHold: ReservationActiveHoldDto | null,
  sectorStands: ReservationMapStandDto[] = stands,
) {
  return render(
    <ClientMap
      festival={{
        id: 10,
        name: "Glitter",
        holdMinutes: 5,
        generalMapUrl: null,
      }}
      profile={{
        id: 3,
        displayName: "Ada",
        category: "illustration",
        participationType: "standard",
        imageUrl: null,
      }}
      sectorId={7}
      sectorName="Sector A"
      stands={sectorStands}
      activeHold={activeHold}
      alreadyReserved={false}
    />,
  );
}

const ownFullTableHold: ReservationActiveHoldDto = {
  id: 20,
  standId: 21,
  standIds: [21, 22],
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
};

afterEach(() => {
  cleanup();
  createStandHold.mockReset();
  pollNow.mockReset();
  pollCallback.current = null;
});

describe("ClientMap", () => {
  it("shows the companion half of the viewer's own full table as theirs", () => {
    renderMap(ownFullTableHold);
    fireEvent.click(screen.getByRole("button", { name: "stand-A2" }));
    expect(
      screen.getByText(/Tenés este espacio reservado temporalmente/),
    ).toBeTruthy();
    expect(screen.queryByText(/Otro participante/)).toBeNull();
    expect(screen.getByText("Continuar con tu reserva")).toBeTruthy();
  });

  it("shows a held stand as someone else's without a hold of the viewer's", () => {
    renderMap(null);
    fireEvent.click(screen.getByRole("button", { name: "stand-A1" }));
    expect(
      screen.getByText(/Otro participante está considerando/),
    ).toBeTruthy();
  });

  it("fires no server action on mount", () => {
    renderMap(ownFullTableHold);
    expect(createStandHold).not.toHaveBeenCalled();
  });

  it("drops the viewer's hold on the first poll after it expired", () => {
    const expiresAt = Date.parse("2026-11-07T00:05:00.000Z");
    renderMap({
      ...ownFullTableHold,
      expiresAt: new Date(expiresAt).toISOString(),
    });
    act(() => {
      pollCallback.current?.({
        stands: [],
        availableCount: 0,
        // The server's timestamp, a second past expiry.
        version: expiresAt + 1_000,
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "stand-A1" }));
    expect(
      screen.getByText(/Otro participante está considerando/),
    ).toBeTruthy();
  });

  it("keeps the hold while the server's clock says it is live, whatever the phone's says", () => {
    // Already past on the phone's clock, a minute ahead on the server's.
    const expiresAt = Date.now() - 60_000;
    renderMap({
      ...ownFullTableHold,
      expiresAt: new Date(expiresAt).toISOString(),
    });
    act(() => {
      pollCallback.current?.({
        stands: [],
        availableCount: 0,
        version: expiresAt - 60_000,
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "stand-A2" }));
    expect(
      screen.getByText(/Tenés este espacio reservado temporalmente/),
    ).toBeTruthy();
  });

  describe("losing a race for a stand", () => {
    const free = (id: number, label: string) =>
      stand(id, label, {
        effectiveStatus: "available",
        status: "available",
        standGroupId: null,
        isFullTableHalf: false,
      });

    function tapAndTake(label: string) {
      renderMap(null, [free(21, "A1"), free(22, "A2")]);
      fireEvent.click(screen.getByRole("button", { name: `stand-${label}` }));
      fireEvent.click(
        screen.getByRole("button", { name: /Seleccionar Stand/ }),
      );
    }

    it("marks the stand taken at once and polls now on STAND_UNAVAILABLE", async () => {
      createStandHold.mockResolvedValue({
        success: false,
        code: "STAND_UNAVAILABLE",
        message: "Este espacio ya no está disponible",
      });
      tapAndTake("A1");

      expect(
        await screen.findByText(/Otro participante está considerando/),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: /Stand No Disponible/ }),
      ).toHaveProperty("disabled", true);
      expect(pollNow).toHaveBeenCalledTimes(1);

      // A2 is untouched until the poll says otherwise.
      fireEvent.click(screen.getByRole("button", { name: "stand-A2" }));
      expect(screen.queryByText(/Otro participante/)).toBeNull();
      act(() => {
        pollCallback.current?.({
          stands: [{ standId: 22, effectiveStatus: "held", updatedAt: null }],
          availableCount: 0,
          version: 2,
        });
      });
      expect(
        screen.getByText(/Otro participante está considerando/),
      ).toBeTruthy();
    });

    it("only polls on CONFLICT_RETRY and keeps the stand reservable", async () => {
      createStandHold.mockResolvedValue({
        success: false,
        code: "CONFLICT_RETRY",
        message: "Reintentá",
      });
      tapAndTake("A1");

      await vi.waitFor(() => expect(pollNow).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(/Otro participante/)).toBeNull();
      expect(
        screen.getByRole("button", { name: /Seleccionar Stand/ }),
      ).toHaveProperty("disabled", false);
    });
  });

  describe("tapping outside the card", () => {
    const press = (
      element: Element,
      down: { x: number; y: number },
      up: { x: number; y: number },
    ) => {
      fireEvent.pointerDown(element, { clientX: down.x, clientY: down.y });
      fireEvent.pointerUp(element, { clientX: up.x, clientY: up.y });
    };

    function openCard() {
      renderMap(ownFullTableHold);
      fireEvent.click(screen.getByRole("button", { name: "stand-A1" }));
      expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
    }

    it("closes it on a tap on the map background", () => {
      openCard();
      press(
        screen.getByTestId("map-background"),
        { x: 100, y: 100 },
        { x: 104, y: 103 },
      );
      expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
    });

    it("keeps it open while panning", () => {
      openCard();
      press(
        screen.getByTestId("map-background"),
        { x: 100, y: 100 },
        { x: 140, y: 100 },
      );
      expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
    });

    it("keeps it open on the map's own buttons", () => {
      openCard();
      press(
        screen.getByRole("button", { name: "Acercar" }),
        { x: 10, y: 10 },
        { x: 10, y: 10 },
      );
      expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
    });
  });
});
