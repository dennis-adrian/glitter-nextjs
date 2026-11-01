import type { Participation } from "@/app/api/users/definitions";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";

/**
 * Inicio's "Tu historial" card: the first and the last festival, how many
 * festivals (two stands in one edition count once), the stands occupied, and
 * who shared them. Pure, so the counting rules are tested on their own.
 */

export type HistoryFestival = {
  festivalId: number;
  name: string;
  posterUrl: string | null;
  startDate: Date | null;
  standLabel: string;
};

export type HistoryPartner = {
  id: number;
  displayName: string | null;
  imageUrl: string | null;
};

export type HistorySummary = {
  first: HistoryFestival;
  /** Null when there is only one festival: first and last are the same. */
  last: HistoryFestival | null;
  festivalCount: number;
  /** Most recent past editions in a row; null below two. */
  streak: number | null;
  stands: string[];
  partners: HistoryPartner[];
};

function firstDay(festival: Participation["reservation"]["festival"]) {
  const dates = festival.festivalDates ?? [];
  const start = dates
    .map((date) => date.startDate)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return start ?? festival.startDate ?? null;
}

/**
 * Past participations only: accepted reservations of festivals other than the
 * active one, whose own card is already on the page.
 *
 * `pastFestivalIds` is every archived festival, newest first, for the streak.
 * `partnersByReservation` holds the other participants of each reservation.
 */
export function buildHistorySummary({
  participations,
  activeFestivalId = null,
  pastFestivalIds,
  partnersByReservation,
}: {
  participations: readonly Participation[];
  activeFestivalId?: number | null;
  pastFestivalIds: readonly number[];
  partnersByReservation: ReadonlyMap<number, readonly HistoryPartner[]>;
}): HistorySummary | null {
  const past = participations.filter(
    (participation) =>
      participation.reservation.status === "accepted" &&
      participation.reservation.festivalId !== activeFestivalId,
  );
  if (past.length === 0) return null;

  const byFestival = new Map<number, HistoryFestival>();
  for (const { reservation } of past) {
    if (byFestival.has(reservation.festivalId)) continue;
    byFestival.set(reservation.festivalId, {
      festivalId: reservation.festivalId,
      name: reservation.festival.name,
      posterUrl:
        reservation.festival.posterUrl ?? reservation.festival.thumbnailUrl,
      startDate: firstDay(reservation.festival),
      standLabel: reservationStandLabel(reservation),
    });
  }

  const festivals = [...byFestival.values()].sort(
    (a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0),
  );
  const first = festivals[0];
  const last = festivals.length > 1 ? festivals[festivals.length - 1] : null;

  let streak = 0;
  for (const festivalId of pastFestivalIds) {
    if (!byFestival.has(festivalId)) break;
    streak += 1;
  }

  const stands = [
    ...new Set(
      past.map(({ reservation }) => reservationStandLabel(reservation)),
    ),
  ];

  const partners = new Map<number, HistoryPartner>();
  for (const { reservation } of past) {
    for (const partner of partnersByReservation.get(reservation.id) ?? []) {
      partners.set(partner.id, partner);
    }
  }

  return {
    first,
    last,
    festivalCount: festivals.length,
    streak: streak >= 2 ? streak : null,
    stands,
    partners: [...partners.values()],
  };
}
