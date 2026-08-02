import { describe, expect, it } from "vitest";

import { getStandMapParticipants } from "@/app/components/maps/map-participants";
import type { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

function userReservation() {
  return {
    status: "accepted",
    participants: [
      {
        id: 1,
        user: {
          id: 42,
          displayName: "Pandora",
          imageUrl: null,
          category: "illustration",
          userSocials: [
            { id: 1, type: "instagram", username: "garabatosdepandora" },
            { id: 2, type: "facebook", username: "garabatosdepandora" },
          ],
        },
      },
    ],
    externalParticipants: [],
  };
}

function externalReservation() {
  return {
    status: "accepted",
    participants: [],
    externalParticipants: [
      {
        externalParticipant: {
          id: 9,
          displayName: "Café Vecino",
          imageUrl: null,
          websiteUrl: "https://cafevecino.example",
          instagramUrl: null,
          contactEmail: "hola@cafevecino.example",
        },
      },
    ],
  };
}

function stand(reservations: unknown[]): StandWithReservationsWithParticipants {
  return { id: 7, reservations } as StandWithReservationsWithParticipants;
}

describe("getStandMapParticipants", () => {
  it("gives a registered user socials and no duplicate links", () => {
    const [participant] = getStandMapParticipants(stand([userReservation()]));

    expect(participant.kind).toBe("user");
    expect(participant.userSocials).toHaveLength(2);
    // Cards render one "Contacto" section per field, so populating both here
    // listed the same accounts twice
    expect(participant.links).toEqual([]);
  });

  it("gives an external participant links and no socials", () => {
    const [participant] = getStandMapParticipants(
      stand([externalReservation()]),
    );

    expect(participant.kind).toBe("external");
    expect(participant.userSocials).toEqual([]);
    expect(participant.links.map((link) => link.label)).toEqual([
      "Sitio web",
      "Correo",
    ]);
  });

  it("never populates both contact fields for the same participant", () => {
    const participants = getStandMapParticipants(
      stand([userReservation(), externalReservation()]),
    );

    expect(participants).toHaveLength(2);
    for (const participant of participants) {
      expect(
        participant.userSocials.length > 0 && participant.links.length > 0,
      ).toBe(false);
    }
  });

  it("skips rejected reservations", () => {
    expect(
      getStandMapParticipants(
        stand([{ ...userReservation(), status: "rejected" }]),
      ),
    ).toEqual([]);
  });
});
