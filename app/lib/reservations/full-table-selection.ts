import type { ReservationMapStandDto } from "@/app/lib/reservations/dto";

/**
 * What selecting a stand will actually produce, from the map's point of view.
 *
 * This is presentation only. The server resolves the pair and rechecks
 * availability inside the hold transaction, so a participant can still land on
 * the fallback after seeing `full` here (PRD §7.4: UI availability is
 * informational). What it must never do is let someone reach a commit without
 * being told which of the two they are getting.
 */
export type FullTableSelection =
  /** Not a paired stand, or the participant has no access — nothing to say. */
  | { kind: "none" }
  /** Both halves look free: selecting takes the whole table. */
  | { kind: "full"; companion: ReservationMapStandDto }
  /** Paired, but the companion is taken: selecting takes half a table. */
  | { kind: "fallback"; companion: ReservationMapStandDto }
  /** Paired and access is active, but the companion is not on the map. */
  | { kind: "fallback"; companion: null };

function isFree(stand: ReservationMapStandDto): boolean {
  return stand.effectiveStatus === "available";
}

/**
 * `sectorStands` is every stand the viewer can see in this sector, which is
 * where the companion lives: a full-table pair must share a sector, so the
 * companion is always in the same list.
 */
export function resolveFullTableSelection(input: {
  stand: ReservationMapStandDto;
  sectorStands: readonly ReservationMapStandDto[];
  accessActive: boolean;
}): FullTableSelection {
  const { stand, sectorStands, accessActive } = input;
  if (!accessActive || !stand.isFullTableHalf || stand.standGroupId == null) {
    return { kind: "none" };
  }

  const companions = sectorStands.filter(
    (candidate) =>
      candidate.id !== stand.id &&
      candidate.standGroupId === stand.standGroupId,
  );
  // A group that is not exactly two stands is malformed and has no companion
  // to speak of; treat it as half a table rather than guessing.
  if (companions.length !== 1) return { kind: "fallback", companion: null };

  const companion = companions[0];
  return isFree(companion)
    ? { kind: "full", companion }
    : { kind: "fallback", companion };
}
