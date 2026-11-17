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
    participants: { userId: number; user: PersonParts }[];
    invoices: { userId: number }[];
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
 * account its cobro is billed to, or failing both its first participant. The
 * same chain the partner edit resolves before it touches a reservation, so the
 * history and the edit page never name different holders.
 */
export function reservationHolderId(reservation: {
  ownerUserId: number | null;
  invoices: readonly { userId: number }[];
  participants: readonly { userId: number }[];
}): number | null {
  if (reservation.ownerUserId != null) return reservation.ownerUserId;
  const invoiceUserId = reservation.invoices[0]?.userId;
  if (invoiceUserId != null) return invoiceUserId;
  const first = [...reservation.participants].sort(
    (a, b) => a.userId - b.userId,
  )[0];
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
      };
    })
    .sort((a, b) => {
      const at = (a.festival.startDate ?? a.joinedAt).getTime();
      const bt = (b.festival.startDate ?? b.joinedAt).getTime();
      if (bt !== at) return bt - at;
      return b.reservationId - a.reservationId;
    });
}
