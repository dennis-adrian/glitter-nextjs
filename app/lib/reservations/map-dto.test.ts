import { describe, expect, it } from "vitest";

import {
  MAP_DTO_FORBIDDEN_KEYS,
  collectForbiddenDtoKeys,
  type FestivalReservationMapDto,
} from "@/app/lib/reservations/dto";
import { buildFestivalReservationMapDto } from "@/app/lib/reservations/map-dto";

const now = new Date("2026-08-31T12:00:00.000Z");

function sampleDto(
  overrides: Partial<Parameters<typeof buildFestivalReservationMapDto>[0]> = {},
) {
  return buildFestivalReservationMapDto({
    festival: {
      id: 10,
      name: "Glitter",
      holdMinutes: 5,
      generalMapUrl: null,
    },
    profile: {
      id: 3,
      displayName: "Ada",
      category: "illustration",
      participationType: "standard",
      imageUrl: "https://img.example/ada.png",
    },
    alreadyReserved: false,
    subcategoryIds: [4],
    sectors: [
      {
        id: 1,
        name: "Nave",
        description: "Sector principal",
        orderInFestival: 1,
        mapOriginX: 0,
        mapOriginY: 0,
        mapWidth: 80,
        mapHeight: 60,
      },
    ],
    mapElementsBySectorId: new Map([
      [
        1,
        [
          {
            id: 9,
            type: "entrance",
            label: "Entrada",
            labelPosition: "bottom",
            labelFontSize: 2,
            labelFontWeight: 500,
            showIcon: true,
            positionLeft: 1,
            positionTop: 1,
            width: 8,
            height: 4,
            rotation: 0,
          },
        ],
      ],
    ]),
    stands: [
      {
        id: 21,
        festivalSectorId: 1,
        label: "A",
        standNumber: 1,
        storedStatus: "held",
        positionLeft: 10,
        positionTop: 12,
        width: 6,
        height: 6,
        standCategory: "illustration",
        participationType: "standard",
        price: 350,
        standGroupId: null,
      },
      {
        id: 22,
        festivalSectorId: 1,
        label: "A",
        standNumber: 2,
        storedStatus: "reserved",
        positionLeft: 16,
        positionTop: 12,
        width: 6,
        height: 6,
        standCategory: "illustration",
        participationType: "standard",
        price: 350,
        standGroupId: 8,
      },
    ],
    subcategoryIdsByStandId: new Map([[21, [4]]]),
    activeHoldStandIds: new Set(),
    activeHold: null,
    reservationsByStandId: new Map([
      [
        22,
        [
          {
            standId: 22,
            status: "accepted",
            revealAt: new Date("2026-09-01T00:00:00.000Z"),
            participants: [
              {
                id: 99,
                displayName: "Hidden Brand",
                imageUrl: "https://img.example/brand.png",
              },
            ],
            externalParticipants: [],
          },
        ],
      ],
    ]),
    revealHiddenIdentities: false,
    now,
    ...overrides,
  });
}

describe("buildFestivalReservationMapDto", () => {
  it("exposes only approved map fields and no PII keys", () => {
    const dto = sampleDto();
    expect(collectForbiddenDtoKeys(dto)).toEqual([]);
    expect(dto).toMatchInlineSnapshot(`
      {
        "activeHold": null,
        "alreadyReserved": false,
        "festival": {
          "generalMapUrl": null,
          "holdMinutes": 5,
          "id": 10,
          "name": "Glitter",
        },
        "profile": {
          "category": "illustration",
          "displayName": "Ada",
          "id": 3,
          "imageUrl": "https://img.example/ada.png",
          "participationType": "standard",
        },
        "sectors": [
          {
            "availableCount": 1,
            "description": "Sector principal",
            "id": 1,
            "mapBounds": {
              "height": 60,
              "minX": 0,
              "minY": 0,
              "width": 80,
            },
            "mapElements": [
              {
                "height": 4,
                "id": 9,
                "label": "Entrada",
                "labelFontSize": 2,
                "labelFontWeight": 500,
                "labelPosition": "bottom",
                "positionLeft": 1,
                "positionTop": 1,
                "rotation": 0,
                "showIcon": true,
                "type": "entrance",
                "width": 8,
              },
            ],
            "name": "Nave",
            "order": 1,
            "price": 350,
            "stands": [
              {
                "effectiveStatus": "available",
                "eligibleSubcategoryIds": [
                  4,
                ],
                "festivalSectorId": 1,
                "hasExternalOccupant": false,
                "height": 6,
                "id": 21,
                "label": "A",
                "occupantKey": null,
                "participationType": "standard",
                "positionLeft": 10,
                "positionTop": 12,
                "price": 350,
                "standCategory": "illustration",
                "standGroupId": null,
                "standNumber": 1,
                "status": "available",
                "visibleParticipantSummaries": [],
                "width": 6,
              },
              {
                "effectiveStatus": "reserved",
                "eligibleSubcategoryIds": [],
                "festivalSectorId": 1,
                "hasExternalOccupant": false,
                "height": 6,
                "id": 22,
                "label": "A",
                "occupantKey": null,
                "participationType": "standard",
                "positionLeft": 16,
                "positionTop": 12,
                "price": 350,
                "standCategory": "illustration",
                "standGroupId": 8,
                "standNumber": 2,
                "status": "reserved",
                "visibleParticipantSummaries": [],
                "width": 6,
              },
            ],
          },
        ],
        "subcategoryIds": [
          4,
        ],
      }
    `);
  });

  it("withholds hidden reservation identity while keeping occupied status", () => {
    const dto = sampleDto();
    const occupied = dto.sectors[0]?.stands.find((stand) => stand.id === 22);
    expect(occupied?.effectiveStatus).toBe("reserved");
    expect(occupied?.visibleParticipantSummaries).toEqual([]);
    expect(occupied?.occupantKey).toBeNull();
  });

  it("reveals participant summaries after revealAt or for admins", () => {
    const dto = sampleDto({ revealHiddenIdentities: true });
    const occupied = dto.sectors[0]?.stands.find((stand) => stand.id === 22);
    expect(occupied?.visibleParticipantSummaries).toEqual([
      {
        id: 99,
        displayName: "Hidden Brand",
        imageUrl: "https://img.example/brand.png",
        reservationStatus: "accepted",
        kind: "user",
      },
    ]);
    expect(occupied?.occupantKey).toBe("user-99");
  });

  it("treats a stale held stand without an unexpired hold as available", () => {
    const dto = sampleDto();
    const held = dto.sectors[0]?.stands.find((stand) => stand.id === 21);
    expect(held?.effectiveStatus).toBe("available");
    expect(held?.status).toBe("available");
  });
});

describe("collectForbiddenDtoKeys", () => {
  it("finds nested PII keys", () => {
    const leak: FestivalReservationMapDto & { email?: string } = sampleDto();
    const nested = {
      ...leak,
      sectors: leak.sectors.map((sector) => ({
        ...sector,
        stands: sector.stands.map((stand) => ({
          ...stand,
          email: "hidden@example.com",
        })),
      })),
    };
    expect(collectForbiddenDtoKeys(nested)).toEqual(["email"]);
    expect(MAP_DTO_FORBIDDEN_KEYS).toContain("clerkId");
  });
});
