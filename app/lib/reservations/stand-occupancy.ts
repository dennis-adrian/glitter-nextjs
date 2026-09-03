/**
 * Resolving which reservations occupy a stand.
 *
 * `stands.reservations` joins on the parent's single `stand_id`, which names
 * only the half a participant picked first. A full table occupies two stands,
 * so its companion looked unoccupied through that relation — on maps, tooltips
 * and drawers alike. Anything asking "who is on this stand?" goes through
 * membership instead.
 */

type StandMemberRow<TReservation> = {
  position: number;
  releasedAt: Date | null;
  reservation: TReservation | null;
};

/**
 * The reservations a stand currently carries, in selection order.
 *
 * A member released by an admin downgrade is dropped: the row is retained as
 * history, but it no longer occupies the stand.
 *
 * A member whose reservation came back empty is dropped too. The join column is
 * `NOT NULL`, so Drizzle types the nested relation as always present, but a
 * caller that filters it (`with: { reservation: { where: ... } }`) gets `null`
 * for every member the filter excluded — a rejected or canceled reservation
 * keeps its member rows unreleased, so those rows reach here.
 */
export function standReservationsFromMembers<TReservation>(
  members: readonly StandMemberRow<TReservation>[],
): NonNullable<TReservation>[] {
  return members
    .filter((member) => member.releasedAt == null && member.reservation != null)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((member) => member.reservation as NonNullable<TReservation>);
}

/**
 * Rewrites a batch of fetched stands so each exposes `reservations` resolved
 * through membership, keeping the shape every existing consumer already reads.
 */
export function withMembershipReservations<
  TStand extends {
    reservationMembers: ReadonlyArray<{
      position: number;
      releasedAt: Date | null;
      reservation: unknown;
    }>;
  },
>(
  stands: readonly TStand[],
): Array<
  Omit<TStand, "reservationMembers"> & {
    reservations: Array<TStand["reservationMembers"][number]["reservation"]>;
  }
> {
  return stands.map((stand) => {
    const { reservationMembers, ...rest } = stand;
    return {
      ...rest,
      reservations: standReservationsFromMembers(reservationMembers),
    };
  });
}

/**
 * The same rewrite for a fetched sector, whose stands carry the membership.
 *
 * The stand type is derived from the sector rather than declared as its own
 * parameter: a parameter that only appears nested cannot be inferred, and TS
 * would fall back to the constraint and drop every other stand column.
 */
export function withMembershipReservationsBySector<
  TSector extends {
    stands: ReadonlyArray<{
      reservationMembers: ReadonlyArray<{
        position: number;
        releasedAt: Date | null;
        reservation: unknown;
      }>;
    }>;
  },
>(
  sectors: readonly TSector[],
): Array<
  Omit<TSector, "stands"> & {
    stands: Array<
      Omit<TSector["stands"][number], "reservationMembers"> & {
        reservations: Array<
          TSector["stands"][number]["reservationMembers"][number]["reservation"]
        >;
      }
    >;
  }
> {
  return sectors.map((sector) => ({
    ...sector,
    stands: withMembershipReservations(sector.stands),
  })) as never;
}
