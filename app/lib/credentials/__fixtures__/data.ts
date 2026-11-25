import type {
  CredentialBatchRow,
  CredentialsData,
  CredentialStandRow,
} from "@/app/lib/credentials/calculate";
import type { CountableReservationStatus } from "@/app/lib/credentials/definitions";

/**
 * A tiny builder for calculator tests and Storybook: festivals described
 * by their reservations, without a database.
 */
export function emptyData(): CredentialsData {
  return {
    festival: { id: 1, name: "Festival de muestra" },
    reservations: [],
    participants: [],
    externals: [],
    volunteers: [],
    volunteerCounts: { accepted: 0, withoutRole: 0, waiting: 0 },
    staff: [],
    extras: [],
    ruleRows: [],
    externalOverrides: [],
    batches: [],
  };
}

let nextId = 1000;
function id() {
  nextId += 1;
  return nextId;
}

export type PersonSpec = {
  name: string;
  userId?: number;
  participationId?: number;
  status?: string;
};

export function addReservation(
  data: CredentialsData,
  {
    id: reservationId = id(),
    category = "illustration",
    stands = 1,
    people = [],
    status = "accepted",
    owner,
    label = "A",
    firstNumber,
  }: {
    id?: number;
    category?: string;
    stands?: number;
    people?: PersonSpec[];
    status?: CountableReservationStatus;
    /** Index into `people`, or a user id that is not a participant. */
    owner?: number | { userId: number };
    label?: string;
    firstNumber?: number;
  },
) {
  const start = firstNumber ?? (reservationId % 900) + 1;
  const standRows: CredentialStandRow[] = Array.from({ length: stands }, (_, index) => ({
    id: id(),
    label,
    standNumber: start + index,
    standCategory: category,
    position: index,
  }));
  const persons = people.map((person) => ({
    participationId: person.participationId ?? id(),
    userId: person.userId ?? id(),
    person,
  }));
  const ownerUserId =
    owner == null
      ? (persons[0]?.userId ?? null)
      : typeof owner === "number"
        ? persons[owner]!.userId
        : owner.userId;
  data.reservations.push({ id: reservationId, status, ownerUserId, stands: standRows });
  for (const { participationId, userId, person } of persons) {
    data.participants.push({
      participationId,
      reservationId,
      user: {
        id: userId,
        displayName: person.name,
        firstName: null,
        lastName: null,
        status: person.status ?? "verified",
      },
    });
  }
  return { reservationId, participations: persons.map((p) => p.participationId), standRows };
}

export function addExternal(
  data: CredentialsData,
  {
    externalId = id(),
    name,
    stands = 1,
    status = "accepted",
    reservationId = id(),
  }: {
    externalId?: number;
    name: string;
    stands?: number;
    status?: CountableReservationStatus;
    reservationId?: number;
  },
) {
  addReservation(data, { id: reservationId, category: "illustration", stands, status, label: "D" });
  data.externals.push({
    reservationId,
    externalParticipantId: externalId,
    displayName: name,
    categoryLabel: "Organización social",
  });
  return { externalId, reservationId };
}

export function batch(
  items: CredentialBatchRow["items"],
  createdAt = new Date("2026-11-14T15:00:00Z"),
  batchId = id(),
): CredentialBatchRow {
  return { id: batchId, note: null, createdAt, createdByName: "Admin", items };
}
