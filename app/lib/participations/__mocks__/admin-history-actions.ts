import { fn } from "storybook/test";

import type { AdminParticipationRow } from "@/app/lib/participations/admin-history";

function festival(id: number, name: string, start: string) {
  const startDate = new Date(start);
  return {
    id,
    name,
    status: "archived",
    startDate,
    endDate: new Date(startDate.getTime() + 86_400_000),
  };
}

// Storybook-only: the participants table's history drawer never reaches the
// database. Two stands in one edition, booked as two reservations, and a long
// festival name a phone has to fit.
const ROWS: AdminParticipationRow[] = [
  {
    participationId: 1,
    reservationId: 7,
    status: "accepted",
    source: "user_reservation",
    isHolder: true,
    standLabel: "A12",
    standCount: 1,
    festival: festival(
      15,
      "Festicker 4ta Edición - Halloween Especial de Ilustración Independiente",
      "2026-10-10T14:00:00Z",
    ),
    companions: [],
    joinedAt: new Date("2026-08-01T00:00:00Z"),
    reservationCreatedAt: new Date("2026-08-01T00:00:00Z"),
  },
  {
    participationId: 2,
    reservationId: 6,
    status: "accepted",
    source: "user_reservation",
    isHolder: true,
    standLabel: "G4",
    standCount: 1,
    festival: festival(12, "Glitter Vol 8", "2025-12-06T14:00:00Z"),
    companions: [
      {
        id: 9,
        name: "María Fernanda de los Ángeles Quispe Mamani",
        email: "mariafernanda@example.com",
      },
    ],
    joinedAt: new Date("2025-10-01T00:00:00Z"),
    reservationCreatedAt: new Date("2025-10-01T00:00:00Z"),
  },
  {
    participationId: 3,
    reservationId: 8,
    status: "accepted",
    source: "user_reservation",
    isHolder: true,
    standLabel: "G5",
    standCount: 1,
    festival: festival(12, "Glitter Vol 8", "2025-12-06T14:00:00Z"),
    companions: [],
    joinedAt: new Date("2025-10-03T00:00:00Z"),
    reservationCreatedAt: new Date("2025-10-03T00:00:00Z"),
  },
];

export const fetchParticipationHistoryAction = fn(async () => ROWS);
