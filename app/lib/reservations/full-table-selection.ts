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
  /** Not a paired stand, or nothing about the pair the viewer can act on. */
  | { kind: "none" }
  /** Access is active and both halves are free: they may take either. */
  | { kind: "full"; companion: ReservationMapStandDto }
  /** Paired, but the companion is taken: selecting takes half a table. */
  | { kind: "fallback"; companion: ReservationMapStandDto }
  /** Paired and access is active, but the companion is not on the map. */
  | { kind: "fallback"; companion: null }
  /**
   * Access is active, but this stand is not part of a table at all.
   *
   * Worth saying out loud: somebody holding the feature reasonably expects
   * every stand to be half of something, and silence here reads as the feature
   * being broken rather than as this stand simply being a stand.
   */
  | { kind: "single" }
  /**
   * Not activated, but they could be right now: the pair is whole and their
   * balance already covers the fee.
   *
   * Offered here rather than only on the panel because the alternative is
   * sending somebody who is already funded back out of the map to press one
   * button. It is not a purchase — §7.2 keeps voucher upload and checkout out
   * of the map, and this is neither.
   */
  | {
      kind: "offer";
      companion: ReservationMapStandDto;
      creditPrice: number;
    };

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
  /**
   * The fee, when the viewer could activate right now — eligible, configured,
   * and already holding enough credits. Null otherwise, which includes anyone
   * who would have to buy first: they go back to the panel, where the purchase
   * lives.
   */
  activationPrice?: number | null;
}): FullTableSelection {
  const { stand, sectorStands, accessActive } = input;
  const activationPrice = input.activationPrice ?? null;

  if (!stand.isFullTableHalf || stand.standGroupId == null) {
    // A plain stand. Only worth a word to somebody who holds access and would
    // otherwise wonder where their table went.
    return accessActive ? { kind: "single" } : { kind: "none" };
  }
  // Neither holding access nor able to take it: nothing here is actionable, so
  // the card says nothing about tables at all.
  if (!accessActive && activationPrice == null) return { kind: "none" };

  const companions = sectorStands.filter(
    (candidate) =>
      candidate.id !== stand.id &&
      candidate.standGroupId === stand.standGroupId,
  );
  // A group that is not exactly two stands is malformed and has no companion
  // to speak of; treat it as half a table rather than guessing.
  if (companions.length !== 1) {
    return accessActive
      ? { kind: "fallback", companion: null }
      : { kind: "none" };
  }

  const companion = companions[0];
  if (!isFree(companion)) {
    // Half a table is all that is left. Somebody who has not activated is not
    // offered the fee for it — there is no whole table to buy.
    return accessActive ? { kind: "fallback", companion } : { kind: "none" };
  }

  if (accessActive) return { kind: "full", companion };
  return { kind: "offer", companion, creditPrice: activationPrice! };
}
