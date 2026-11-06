// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReservationMapStandDto } from "@/app/lib/reservations/dto";

const createStandHold = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/stands/hold-actions", () => ({ createStandHold }));
vi.mock("@/app/lib/reservations/full-table-actions", () => ({
  activateFullTableAccessAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
}));

import {
  StandInfoCard,
  type ActiveHold,
} from "@/app/components/festivals/reservations/stand-info-card";

function stand(
  id: number,
  label: string,
  overrides: Partial<ReservationMapStandDto> = {},
): ReservationMapStandDto {
  return {
    id,
    label,
    standNumber: id,
    effectiveStatus: "available",
    status: "available",
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

function renderCard(options: {
  target: ReservationMapStandDto;
  sectorStands: ReservationMapStandDto[];
  activeHold?: ActiveHold;
  onHoldChange?: (hold: ActiveHold) => void;
}) {
  return render(
    <StandInfoCard
      stand={options.target}
      sectorName="Sector A"
      profile={{
        id: 3,
        displayName: "Ada",
        category: "illustration",
        participationType: "standard",
        imageUrl: null,
      }}
      festival={{ id: 10, name: "Glitter", holdMinutes: 5, generalMapUrl: null }}
      alreadyReserved={false}
      subcategoryIds={[]}
      activeHold={options.activeHold ?? null}
      sectorStands={options.sectorStands}
      fullTableAccessActive
      onHoldChange={options.onHoldChange}
      onClose={vi.fn()}
      isPending={false}
      startTransition={(callback) => {
        void callback();
      }}
    />,
  );
}

afterEach(() => {
  cleanup();
  createStandHold.mockReset();
  replace.mockReset();
});

describe("StandInfoCard", () => {
  it("reports both halves when the server took the full table", async () => {
    createStandHold.mockResolvedValue({
      success: true,
      message: "Mesa completa reservada temporalmente",
      data: { holdId: 5, isFullTable: true },
    });
    const onHoldChange = vi.fn();
    const a1 = stand(21, "A1");
    const a2 = stand(22, "A2");
    renderCard({
      target: a1,
      sectorStands: [a1, a2, stand(23, "B1", { standGroupId: 9 })],
      onHoldChange,
    });

    fireEvent.click(screen.getByRole("button", { name: /mesa completa/i }));

    await waitFor(() =>
      expect(onHoldChange).toHaveBeenCalledWith({
        id: 5,
        standId: 21,
        standIds: [21, 22],
      }),
    );
  });

  it("reports one stand when the server took only the half", async () => {
    createStandHold.mockResolvedValue({
      success: true,
      message: "Espacio reservado temporalmente",
      data: { holdId: 6, isFullTable: false },
    });
    const onHoldChange = vi.fn();
    const a1 = stand(21, "A1");
    renderCard({
      target: a1,
      sectorStands: [a1, stand(22, "A2")],
      onHoldChange,
    });

    fireEvent.click(screen.getByRole("button", { name: /mesa completa/i }));

    await waitFor(() =>
      expect(onHoldChange).toHaveBeenCalledWith({
        id: 6,
        standId: 21,
        standIds: [21],
      }),
    );
  });

  it("offers to continue on the viewer's own held stand", () => {
    const a1 = stand(21, "A1", { effectiveStatus: "held", status: "held" });
    renderCard({
      target: a1,
      sectorStands: [a1],
      activeHold: { id: 5, standId: 21, standIds: [21] },
    });
    expect(screen.getByText("Continuar con tu reserva")).toBeTruthy();
  });
});
