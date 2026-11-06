// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ReservationActiveHoldDto,
  ReservationMapStandDto,
} from "@/app/lib/reservations/dto";
import type { StandStatusPollResult } from "@/app/lib/stands/status-poll";

const createStandHold = vi.hoisted(() => vi.fn());
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
    return { stale: false };
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
    <div>
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

function renderMap(activeHold: ReservationActiveHoldDto | null) {
  return render(
    <ClientMap
      festival={{ id: 10, name: "Glitter", holdMinutes: 5, generalMapUrl: null }}
      profile={{
        id: 3,
        displayName: "Ada",
        category: "illustration",
        participationType: "standard",
        imageUrl: null,
      }}
      sectorId={7}
      sectorName="Sector A"
      stands={stands}
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
    renderMap({
      ...ownFullTableHold,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    act(() => {
      pollCallback.current?.({ stands: [], availableCount: 0, version: 1 });
    });
    fireEvent.click(screen.getByRole("button", { name: "stand-A1" }));
    expect(
      screen.getByText(/Otro participante está considerando/),
    ).toBeTruthy();
  });
});
