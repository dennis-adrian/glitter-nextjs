// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FullTableSelectionNotice from "@/app/components/festivals/reservations/full-table-selection-notice";
import HalfTableFallbackDialog from "@/app/components/festivals/reservations/half-table-fallback-dialog";

import type { ReservationMapStandDto } from "@/app/lib/reservations/dto";

function stand(id: number, label: string): ReservationMapStandDto {
  return {
    id,
    label,
    standNumber: id,
    effectiveStatus: "available",
    status: "available",
    positionLeft: 0,
    positionTop: 0,
    width: 10,
    height: 10,
    standCategory: "illustration",
    participationType: "standard",
    price: 100,
    eligibleSubcategoryIds: [],
    festivalSectorId: 1,
    standGroupId: 7,
    isFullTableHalf: true,
    occupantKey: null,
    hasExternalOccupant: false,
    visibleParticipantSummaries: [],
  };
}

/**
 * The half-table fallback has to be stated at every stage where a participant
 * can still commit (PRD §7.4). These assert the words themselves, because the
 * wording is the feature: someone who paid for a full table must not discover
 * they booked half of one only afterwards.
 */
describe("full-table disclosure", () => {
  // Auto-cleanup is not configured globally, so each render is torn down here.
  afterEach(cleanup);

  it("says nothing when there is nothing to disclose", () => {
    const { container } = render(
      <FullTableSelectionNotice selection={{ kind: "none" }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("names the companion when the whole table is available", () => {
    render(
      <FullTableSelectionNotice
        selection={{ kind: "full", companion: stand(2, "B") }}
      />,
    );

    expect(screen.getByText(/podés tomar la mesa completa/i)).toBeTruthy();
    expect(screen.getByText(/B2/)).toBeTruthy();
    expect(screen.getByText(/240 × 60 cm/)).toBeTruthy();
  });

  it("says one stand, not half a stand, when the companion is gone", () => {
    render(
      <FullTableSelectionNotice
        selection={{ kind: "fallback", companion: stand(2, "B") }}
      />,
    );

    expect(
      screen.getByText(/esta mesa ya no está disponible completa/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/un solo stand \(media mesa, 120 × 60 cm\)/i),
    ).toBeTruthy();
    expect(screen.getByText(/tus créditos no se usarán/i)).toBeTruthy();
  });

  it("still discloses the fallback when the companion cannot be named", () => {
    render(
      <FullTableSelectionNotice
        selection={{ kind: "fallback", companion: null }}
      />,
    );

    expect(
      screen.getByText(/un solo stand \(media mesa, 120 × 60 cm\)/i),
    ).toBeTruthy();
  });

  // A stand *is* half a table, so "medio stand" would describe half of a
  // 120 x 60 space. Guarding the phrase because it reads as plausible and the
  // PRD's own suggested copy uses it.
  it("never calls a single stand half a stand", () => {
    render(
      <FullTableSelectionNotice
        selection={{ kind: "fallback", companion: stand(2, "B") }}
      />,
    );
    render(
      <HalfTableFallbackDialog
        open
        stand={stand(1, "A")}
        companion={stand(2, "B")}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        isPending={false}
      />,
    );

    expect(document.body.textContent).not.toMatch(/medio stand/i);
    expect(document.body.textContent).not.toMatch(/medio espacio/i);
  });

  it("makes the confirmation dialog name one stand before taking capacity", () => {
    render(
      <HalfTableFallbackDialog
        open
        stand={stand(1, "A")}
        companion={stand(2, "B")}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        isPending={false}
      />,
    );

    expect(
      screen.getByText(/esta mesa ya no está disponible completa/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/podés reservar solo el espacio A1 o elegir otra mesa/i),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /vas a reservar un solo stand \(media mesa, 120 × 60 cm\), no la mesa completa/i,
      ),
    ).toBeTruthy();
    // Both ways out are offered, so accepting half a table is a real choice.
    expect(
      screen.getByRole("button", { name: /elegir otra mesa/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /reservar un solo stand/i }),
    ).toBeTruthy();
  });
});
