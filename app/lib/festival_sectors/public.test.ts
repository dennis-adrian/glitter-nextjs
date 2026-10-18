// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { toPublicMapSectors } from "@/app/lib/festival_sectors/public";
import { withoutParticipantRoster } from "@/app/lib/festivals/utils";

const participantUser = {
  id: 7,
  displayName: "Tinta Viva",
  imageUrl: "https://example.com/tinta.png",
  category: "illustration",
  email: "tinta@example.com",
  phoneNumber: "+59170000000",
  birthdate: new Date("1990-01-01T00:00:00.000Z"),
  clerkId: "user_abc",
  firstName: "Ana",
  lastName: "Rojas",
  userSocials: [
    {
      id: 3,
      userId: 7,
      type: "instagram",
      username: "tintaviva",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  profileSubcategories: [],
};

const brand = {
  id: 40,
  displayName: "Café Andino",
  type: "brand",
  customCategoryLabel: null,
  description: "Café de altura",
  imageUrl: "https://example.com/cafe.png",
  websiteUrl: "https://cafe.example.com",
  instagramUrl: "https://instagram.com/cafe",
  contactEmail: "hola@cafe.example.com",
  contactPhone: "+59171111111",
  createdByUserId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const revealAt = new Date("2026-01-01T00:00:00.000Z");

const sectors = [
  {
    id: 1,
    name: "A",
    stands: [
      {
        id: 10,
        reservations: [
          {
            id: 100,
            standId: 10,
            festivalId: 3,
            status: "accepted",
            source: "user_reservation",
            ownerUserId: 7,
            priceAmountSnapshot: 350,
            individualPriceSnapshot: 350,
            sharedPriceSnapshot: 200,
            fullTablePriceSnapshot: 600,
            bookedParticipantCount: 1,
            idempotencyKey: "reserve-7-10",
            revealAt,
            createdAt: new Date(),
            updatedAt: new Date(),
            participants: [{ id: 1000, user: participantUser }],
            externalParticipants: [
              {
                id: 500,
                externalParticipantId: 40,
                reservationId: 100,
                createdAt: new Date(),
                updatedAt: new Date(),
                externalParticipant: brand,
              },
            ],
          },
        ],
      },
    ],
    mapElements: [],
  },
] as unknown as FestivalSectorWithStandsWithReservationsWithParticipants[];

function publicUser(
  result: FestivalSectorWithStandsWithReservationsWithParticipants[],
) {
  return result[0].stands[0].reservations[0].participants[0].user;
}

describe("toPublicMapSectors", () => {
  it("keeps only what a map card shows of each occupant", () => {
    const user = publicUser(toPublicMapSectors(sectors));

    expect(user).toEqual({
      id: 7,
      displayName: "Tinta Viva",
      imageUrl: "https://example.com/tinta.png",
      category: "illustration",
      userSocials: [],
      profileSubcategories: [],
    });
  });

  it("keeps the public social handles when the page shows them", () => {
    const user = publicUser(
      toPublicMapSectors(sectors, { includeSocials: true }),
    );

    expect(user.userSocials).toEqual([
      { id: 3, userId: 7, type: "instagram", username: "tintaviva" },
    ]);
    expect(user).not.toHaveProperty("email");
    expect(user).not.toHaveProperty("phoneNumber");
    expect(user).not.toHaveProperty("birthdate");
    expect(user).not.toHaveProperty("clerkId");
  });
});

describe("toPublicMapSectors reservations", () => {
  const reservation = toPublicMapSectors(sectors)[0].stands[0].reservations[0];

  it("keeps what decides occupancy and reveal, and nothing about the booking", () => {
    expect(reservation).toEqual({
      id: 100,
      standId: 10,
      festivalId: 3,
      status: "accepted",
      revealAt,
      participants: expect.any(Array),
      externalParticipants: expect.any(Array),
    });
  });

  it("keeps what a brand's card links to, never its phone or creator", () => {
    expect(reservation.externalParticipants).toEqual([
      {
        id: 500,
        externalParticipantId: 40,
        reservationId: 100,
        externalParticipant: {
          id: 40,
          displayName: "Café Andino",
          type: "brand",
          customCategoryLabel: null,
          description: "Café de altura",
          imageUrl: "https://example.com/cafe.png",
          websiteUrl: "https://cafe.example.com",
          instagramUrl: "https://instagram.com/cafe",
          contactEmail: "hola@cafe.example.com",
        },
      },
    ]);
  });
});

describe("withoutParticipantRoster", () => {
  it("drops the enrolled profiles and reservations, and nothing else", () => {
    const festival = {
      id: 1,
      name: "Glitter",
      userRequests: [{ user: participantUser }],
      standReservations: [{ id: 100 }],
      festivalActivities: [],
    };

    expect(withoutParticipantRoster(festival, 7)).toEqual({
      id: 1,
      name: "Glitter",
      userRequests: [],
      standReservations: [],
      festivalActivities: [],
    });
  });
});
