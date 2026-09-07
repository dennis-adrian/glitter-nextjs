/**
 * Resolving which reservations occupy a stand.
 *
 * `stands.reservations` joins on the parent's single `stand_id`, which names
 * only the half a participant picked first. A full table occupies two stands,
 * so its companion looked unoccupied through that relation — on maps, tooltips
 * and drawers alike. Anything asking "who is on this stand?" goes through
 * membership instead.
 */

type StandMemberRow = {
  reservationId: number;
  position: number;
  releasedAt: Date | null;
};

type OccupiableStand<TReservation> = {
  id: number;
  reservations: TReservation[];
  reservationMembers: readonly StandMemberRow[];
};

/**
 * Rewrites fetched stands so each exposes the reservations that actually
 * occupy it, resolved through membership.
 *
 * The reservations are matched against the ones already fetched rather than
 * joined a second time under the member rows: Postgres truncates identifiers
 * at 63 bytes, and nesting `reservation -> participants -> user` beneath
 * `reservationMembers` pushes drizzle's generated aliases past that, at which
 * point `_participants` and `_participants_user` collapse to the same name and
 * the query fails.
 *
 * Matching in memory is sound because a stand's companion always sits in the
 * same result set — a full-table pair must share a sector — so the reservation
 * is present via its primary half even though the companion's own
 * `reservations` array is empty.
 */
export function withMembershipReservations<
  TReservation extends { id: number },
  TStand extends OccupiableStand<TReservation>,
>(
  stands: readonly TStand[],
  /** Reservations from a wider scope, when the caller fetched several sectors. */
  index?: ReadonlyMap<number, TReservation>,
): TStand[] {
  const byId = index ?? indexReservations(stands);

  return stands.map((stand) => {
    const resolved = stand.reservationMembers
      .filter((member) => member.releasedAt == null)
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((member) => byId.get(member.reservationId))
      .filter(
        (reservation): reservation is TReservation => reservation != null,
      );

    return {
      ...stand,
      // Membership is authoritative wherever it exists, including when every
      // member was released: the parent's `stand_id` still points at the stand
      // it started on, so falling back on an empty result would keep a released
      // half looking occupied. The fallback is only for a database whose
      // membership has not been backfilled at all.
      reservations:
        stand.reservationMembers.length > 0 ? resolved : stand.reservations,
    };
  });
}

function indexReservations<
  TReservation extends { id: number },
  TStand extends OccupiableStand<TReservation>,
>(stands: readonly TStand[]): Map<number, TReservation> {
  const byId = new Map<number, TReservation>();
  for (const stand of stands) {
    for (const reservation of stand.reservations) {
      byId.set(reservation.id, reservation);
    }
  }
  return byId;
}

/** The same rewrite for fetched sectors, indexed across all of them. */
export function withMembershipReservationsBySector<
  TReservation extends { id: number },
  TStand extends OccupiableStand<TReservation>,
  TSector extends { stands: TStand[] },
>(sectors: readonly TSector[]): TSector[] {
  const byId = indexReservations(sectors.flatMap((sector) => sector.stands));
  return sectors.map((sector) => ({
    ...sector,
    stands: withMembershipReservations(sector.stands, byId),
  }));
}
