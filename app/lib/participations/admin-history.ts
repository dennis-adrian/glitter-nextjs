import type { ReservationBase } from "@/app/api/reservations/definitions";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";
import type { StandLabelParts } from "@/app/lib/stands/helpers";

type PersonParts = {
  id: number;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

/** The shape the history query reads: one participation row and its context. */
export type AdminParticipationSource = {
  id: number;
  userId: number;
  createdAt: Date;
  reservation: {
    id: number;
    status: ReservationBase["status"];
    source: ReservationBase["source"];
    ownerUserId: number | null;
    createdAt: Date;
    stand: StandLabelParts;
    members: {
      position: number;
      releasedAt: Date | null;
      stand: StandLabelParts;
    }[];
    festival: {
      id: number;
      name: string;
      status: string;
      festivalDates: { startDate: Date; endDate: Date }[];
    };
    participants: { id: number; userId: number; user: PersonParts }[];
    /** In id order. */
    invoices: { userId: number; status: string }[];
  };
};

export type AdminParticipationRow = {
  participationId: number;
  reservationId: number;
  status: ReservationBase["status"];
  source: ReservationBase["source"];
  /** Whether this account holds the reservation rather than sharing it. */
  isHolder: boolean;
  standLabel: string;
  standCount: number;
  festival: {
    id: number;
    name: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
  };
  /** Everyone else on the reservation. */
  companions: { id: number; name: string; email: string }[];
  /** When this account joined the reservation. */
  joinedAt: Date;
  /** When the reservation was made; orders a festival that has no dates. */
  reservationCreatedAt: Date;
};

export function personName(person: PersonParts): string {
  const display = person.displayName?.trim();
  if (display) return display;
  const full = [person.firstName, person.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return full || person.email;
}

/**
 * Who holds a reservation: its owner, or for a legacy row with no owner the
 * account its first live cobro is billed to, or failing both the participation
 * made first. The rule the repricing reminders already use for an ownerless
 * reservation (`taskHolderForOwnerlessReservation`), so the history, the
 * transfer and the reminders name the same person.
 *
 * Ordered by participation row, not by user id: a transfer moves a row rather
 * than recreating it, so the holder of an ownerless reservation cannot shift
 * to a companion or to the target just because of whose id is lower.
 *
 * `invoices` must be in id order.
 */
export function reservationHolderId(reservation: {
  ownerUserId: number | null;
  invoices: readonly { userId: number; status: string }[];
  participants: readonly { id: number; userId: number }[];
}): number | null {
  if (reservation.ownerUserId != null) return reservation.ownerUserId;
  const payer = reservation.invoices.find(
    (invoice) => invoice.status !== "cancelled",
  );
  if (payer) return payer.userId;
  const first = [...reservation.participants].sort((a, b) => a.id - b.id)[0];
  return first?.userId ?? null;
}

function festivalBounds(dates: readonly { startDate: Date; endDate: Date }[]) {
  if (dates.length === 0) return { startDate: null, endDate: null };
  const starts = dates.map((date) => date.startDate.getTime());
  const ends = dates.map((date) => date.endDate.getTime());
  return {
    startDate: new Date(Math.min(...starts)),
    endDate: new Date(Math.max(...ends)),
  };
}

/**
 * Every participation of one account, newest festival first.
 *
 * Unlike the participant's own history this keeps every status: an admin
 * looking into an account needs the rejected and cancelled reservations too,
 * since those are what keep a participant out of a festival. A festival with
 * no dates yet sorts by when the reservation was made.
 */
export function buildAdminParticipationHistory(
  rows: readonly AdminParticipationSource[],
): AdminParticipationRow[] {
  return rows
    .map((row): AdminParticipationRow => {
      const { reservation } = row;
      const bounds = festivalBounds(reservation.festival.festivalDates);
      const activeMembers = reservation.members.filter(
        (member) => member.releasedAt == null,
      );
      return {
        participationId: row.id,
        reservationId: reservation.id,
        status: reservation.status,
        source: reservation.source,
        isHolder: reservationHolderId(reservation) === row.userId,
        standLabel: reservationStandLabel(reservation),
        standCount: Math.max(activeMembers.length, 1),
        festival: {
          id: reservation.festival.id,
          name: reservation.festival.name,
          status: reservation.festival.status,
          ...bounds,
        },
        companions: reservation.participants
          .filter((participant) => participant.userId !== row.userId)
          .map((participant) => ({
            id: participant.user.id,
            name: personName(participant.user),
            email: participant.user.email,
          })),
        joinedAt: row.createdAt,
        reservationCreatedAt: reservation.createdAt,
      };
    })
    .sort((a, b) => {
      const at = (a.festival.startDate ?? a.reservationCreatedAt).getTime();
      const bt = (b.festival.startDate ?? b.reservationCreatedAt).getTime();
      if (bt !== at) return bt - at;
      return b.reservationId - a.reservationId;
    });
}

/** One festival in an account's history, with every reservation it had there. */
export type AdminFestivalParticipation = {
  festival: AdminParticipationRow["festival"];
  /** Oldest first: the order they were made in. */
  reservations: AdminParticipationRow[];
};

/**
 * The history as the admin reads it: one entry per festival. Until recently
 * the only way to hold two stands in one edition was to make two reservations,
 * which also made two participations, but it is still one participation in
 * that festival. Each reservation stays listed inside its festival, since
 * reviewing or transferring one is still a per-reservation decision.
 *
 * Festivals keep the order of `buildAdminParticipationHistory`, newest first.
 */
export function groupParticipationHistoryByFestival(
  rows: readonly AdminParticipationRow[],
): AdminFestivalParticipation[] {
  const groups = new Map<number, AdminFestivalParticipation>();
  for (const row of rows) {
    const group = groups.get(row.festival.id);
    if (group) group.reservations.push(row);
    else
      groups.set(row.festival.id, {
        festival: row.festival,
        reservations: [row],
      });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    reservations: [...group.reservations].sort(
      (a, b) =>
        a.reservationCreatedAt.getTime() - b.reservationCreatedAt.getTime() ||
        a.reservationId - b.reservationId,
    ),
  }));
}

/** "1 cobro", "2 cobros": the count with the word that fits it. */
export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Festivals that count as a participation: those with a confirmed (accepted)
 * reservation. The same rule as the participants table's "Participaciones"
 * column, so the number an admin clicks is the number the history repeats.
 */
export function countParticipatedFestivals(
  groups: readonly AdminFestivalParticipation[],
): number {
  return groups.filter((group) =>
    group.reservations.some((reservation) => reservation.status === "accepted"),
  ).length;
}

/**
 * The line under the title. It leads with the participations, counted like
 * the table's column, then says what else the list holds: festivals with only
 * cancelled or rejected reservations, and a second stand in an edition.
 */
export function participationHistorySummary(
  groups: readonly AdminFestivalParticipation[],
): string {
  if (groups.length === 0) {
    return "Esta cuenta todavía no participó de ningún festival.";
  }
  const participated = countParticipatedFestivals(groups);
  const reservations = groups.reduce(
    (sum, group) => sum + group.reservations.length,
    0,
  );
  const lead = plural(participated, "participación", "participaciones");
  if (participated === groups.length && reservations === groups.length) {
    return `${lead}, de la más reciente a la más antigua.`;
  }
  return `${lead} · Se listan ${plural(groups.length, "festival", "festivales")} y ${plural(reservations, "reserva", "reservas")}, incluidas las canceladas y rechazadas.`;
}
