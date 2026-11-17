import { describe, expect, it } from "vitest";

import {
  buildAdminParticipationHistory,
  personName,
  reservationHolderId,
  type AdminParticipationSource,
} from "@/app/lib/participations/admin-history";

function person(id: number, displayName: string | null = `P${id}`) {
  return {
    id,
    displayName,
    firstName: null,
    lastName: null,
    email: `p${id}@example.test`,
  };
}

function row(input: {
  id: number;
  userId?: number;
  reservationId: number;
  festivalId: number;
  festivalName?: string;
  start?: Date;
  status?: AdminParticipationSource["reservation"]["status"];
  ownerUserId?: number | null;
  participantIds?: number[];
  invoiceUserIds?: number[];
  createdAt?: Date;
  reservationCreatedAt?: Date;
  members?: AdminParticipationSource["reservation"]["members"];
}): AdminParticipationSource {
  const userId = input.userId ?? 1;
  const createdAt = input.createdAt ?? new Date("2024-01-01T00:00:00Z");
  return {
    id: input.id,
    userId,
    createdAt,
    reservation: {
      id: input.reservationId,
      status: input.status ?? "accepted",
      source: "user_reservation",
      ownerUserId: input.ownerUserId === undefined ? userId : input.ownerUserId,
      createdAt: input.reservationCreatedAt ?? createdAt,
      stand: { label: "A", standNumber: input.reservationId },
      members: input.members ?? [],
      festival: {
        id: input.festivalId,
        name: input.festivalName ?? `F${input.festivalId}`,
        status: "archived",
        festivalDates: input.start
          ? [
              {
                startDate: input.start,
                endDate: new Date(input.start.getTime() + 3_600_000),
              },
            ]
          : [],
      },
      participants: (input.participantIds ?? [userId]).map((id, index) => ({
        id: index + 1,
        userId: id,
        user: person(id),
      })),
      invoices: (input.invoiceUserIds ?? []).map((id) => ({
        userId: id,
        status: "pending",
      })),
    },
  };
}

describe("buildAdminParticipationHistory", () => {
  it("lists every status, newest festival first", () => {
    const rows = buildAdminParticipationHistory([
      row({
        id: 1,
        reservationId: 10,
        festivalId: 1,
        start: new Date("2023-05-01T15:00:00Z"),
        status: "rejected",
      }),
      row({
        id: 2,
        reservationId: 11,
        festivalId: 2,
        start: new Date("2025-05-01T15:00:00Z"),
      }),
      // No dates yet: sorted by when the reservation was made.
      row({
        id: 3,
        reservationId: 12,
        festivalId: 3,
        createdAt: new Date("2024-06-01T00:00:00Z"),
        status: "cancelled",
      }),
    ]);
    expect(rows.map((item) => item.reservationId)).toEqual([11, 12, 10]);
    expect(rows.map((item) => item.status)).toEqual([
      "accepted",
      "cancelled",
      "rejected",
    ]);
    expect(rows[2].festival.startDate).toEqual(
      new Date("2023-05-01T15:00:00Z"),
    );
  });

  it("orders undated festivals by when the reservation was made, not when this account joined it", () => {
    const rows = buildAdminParticipationHistory([
      // Joined late (a late partner, or a transfer), but reserved early.
      row({
        id: 1,
        reservationId: 10,
        festivalId: 1,
        reservationCreatedAt: new Date("2024-01-01T00:00:00Z"),
        createdAt: new Date("2024-09-01T00:00:00Z"),
      }),
      row({
        id: 2,
        reservationId: 11,
        festivalId: 2,
        reservationCreatedAt: new Date("2024-05-01T00:00:00Z"),
        createdAt: new Date("2024-05-01T00:00:00Z"),
      }),
    ]);
    expect(rows.map((item) => item.reservationId)).toEqual([11, 10]);
    // The participation keeps its own date.
    expect(rows[1].joinedAt).toEqual(new Date("2024-09-01T00:00:00Z"));
    expect(rows[1].reservationCreatedAt).toEqual(
      new Date("2024-01-01T00:00:00Z"),
    );
  });

  it("names the companions and whether this account holds the reservation", () => {
    const [shared] = buildAdminParticipationHistory([
      row({
        id: 1,
        userId: 1,
        reservationId: 10,
        festivalId: 1,
        ownerUserId: 2,
        participantIds: [2, 1],
      }),
    ]);
    expect(shared.isHolder).toBe(false);
    expect(shared.companions).toEqual([
      { id: 2, name: "P2", email: "p2@example.test" },
    ]);
  });

  it("labels a full table by both of its live stands", () => {
    const [table] = buildAdminParticipationHistory([
      row({
        id: 1,
        reservationId: 10,
        festivalId: 1,
        members: [
          {
            position: 1,
            releasedAt: null,
            stand: { label: "B", standNumber: 2 },
          },
          {
            position: 0,
            releasedAt: null,
            stand: { label: "B", standNumber: 1 },
          },
        ],
      }),
    ]);
    expect(table.standLabel).toBe("B1 y B2");
    expect(table.standCount).toBe(2);
  });
});

describe("reservationHolderId", () => {
  it("prefers the owner, then the live payer, then the participation made first", () => {
    expect(
      reservationHolderId({
        ownerUserId: 5,
        invoices: [{ userId: 6, status: "pending" }],
        participants: [{ id: 1, userId: 7 }],
      }),
    ).toBe(5);
    expect(
      reservationHolderId({
        ownerUserId: null,
        invoices: [{ userId: 6, status: "paid" }],
        participants: [{ id: 1, userId: 7 }],
      }),
    ).toBe(6);
    expect(
      reservationHolderId({
        ownerUserId: null,
        invoices: [],
        participants: [{ id: 1, userId: 7 }],
      }),
    ).toBe(7);
    expect(
      reservationHolderId({
        ownerUserId: null,
        invoices: [],
        participants: [],
      }),
    ).toBeNull();
  });

  it("skips a cancelled cobro, like the repricing reminders do", () => {
    expect(
      reservationHolderId({
        ownerUserId: null,
        invoices: [
          { userId: 3, status: "cancelled" },
          { userId: 4, status: "pending" },
        ],
        participants: [
          { id: 1, userId: 3 },
          { id: 2, userId: 4 },
        ],
      }),
    ).toBe(4);
  });

  it("orders participations by row, so a lower user id taking a row over changes nothing", () => {
    // Row 10 (user 5) was made first. User 9 on row 11 hands it to user 3: the
    // row keeps its id, so user 5 still holds it although 3 is the lower id.
    const before = reservationHolderId({
      ownerUserId: null,
      invoices: [],
      participants: [
        { id: 11, userId: 9 },
        { id: 10, userId: 5 },
      ],
    });
    const after = reservationHolderId({
      ownerUserId: null,
      invoices: [],
      participants: [
        { id: 11, userId: 3 },
        { id: 10, userId: 5 },
      ],
    });
    expect(before).toBe(5);
    expect(after).toBe(5);
  });
});

describe("personName", () => {
  it("falls back from display name to full name to email", () => {
    expect(personName(person(1, "  Ana  "))).toBe("Ana");
    expect(
      personName({ ...person(1, null), firstName: "Ana", lastName: "Paz" }),
    ).toBe("Ana Paz");
    expect(personName(person(1, ""))).toBe("p1@example.test");
  });
});
