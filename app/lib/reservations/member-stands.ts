import { formatStandLabel } from "@/app/lib/stands/helpers";

import type { StandLabelParts } from "@/app/lib/stands/helpers";

export type ReservationMemberStand = StandLabelParts & {
  id: number;
  standCategory: string;
  /** Set once this half stopped occupying its stand (an admin downgrade). */
  releasedAt?: Date | null;
  position?: number;
};

export type ReservationStandsSummary = {
  /** Stands the reservation still occupies, in selection order. */
  active: ReservationMemberStand[];
  /** Halves retired by an admin downgrade; retained as history (PRD §7.7). */
  released: ReservationMemberStand[];
  /** The half the participant originally selected. */
  primary: ReservationMemberStand | null;
  isFullTable: boolean;
  /** `A1 y A2`, ready to drop into a sentence. */
  label: string;
  /** Physical size of what is actually occupied. */
  dimensions: string;
};

const HALF_TABLE = "60cm x 120cm";
const FULL_TABLE = "60cm x 240cm";
const GASTRONOMY = "140cm x 70cm";

function byPosition(a: ReservationMemberStand, b: ReservationMemberStand) {
  return (a.position ?? 0) - (b.position ?? 0);
}

/**
 * Describes what a reservation actually occupies.
 *
 * Reservation detail used to read the parent's single `stand_id`, which names
 * only the half the participant picked first — so a full table showed as one
 * space. Everything user-facing goes through here instead, off the aggregate's
 * membership.
 */
export function summarizeReservationStands(
  members: readonly ReservationMemberStand[],
): ReservationStandsSummary {
  const sorted = [...members].sort(byPosition);
  const active = sorted.filter((member) => member.releasedAt == null);
  const released = sorted.filter((member) => member.releasedAt != null);
  // Position 0 is the originally selected half, whether or not it survived a
  // downgrade — so fall back to the whole sorted set, not just the active one.
  const primary = active[0] ?? sorted[0] ?? null;
  const isFullTable = active.length > 1;

  const category = primary?.standCategory;
  const dimensions =
    category === "gastronomy"
      ? GASTRONOMY
      : isFullTable
        ? FULL_TABLE
        : HALF_TABLE;

  return {
    active,
    released,
    primary,
    isFullTable,
    label: active.map((member) => formatStandLabel(member)).join(" y "),
    dimensions,
  };
}

/**
 * A stand label for a reservation whose membership may not have been loaded.
 *
 * Emails and cards render from whatever their sender fetched. Where membership
 * is available this names every occupied stand ("A1 y A2"); where it is not, it
 * falls back to the originally selected half rather than showing nothing.
 */
export function reservationStandLabel(reservation: {
  stand: StandLabelParts;
  members?: ReadonlyArray<{
    position: number;
    releasedAt: Date | null;
    stand: StandLabelParts;
  }> | null;
}): string {
  const members = reservation.members ?? [];
  const active = members
    .filter((member) => member.releasedAt == null)
    .slice()
    .sort((a, b) => a.position - b.position);
  if (active.length === 0) return formatStandLabel(reservation.stand);
  return active.map((member) => formatStandLabel(member.stand)).join(" y ");
}

/**
 * How many stands `reservationStandLabel` just named.
 *
 * Copy that talks about what was released has to agree in number with the
 * label, so it needs the count from the same source the label came from.
 */
export function reservationStandCount(reservation: {
  stand: StandLabelParts;
  members?: ReadonlyArray<{
    position: number;
    releasedAt: Date | null;
    stand: StandLabelParts;
  }> | null;
}): number {
  const active = (reservation.members ?? []).filter(
    (member) => member.releasedAt == null,
  );
  return active.length === 0 ? 1 : active.length;
}
