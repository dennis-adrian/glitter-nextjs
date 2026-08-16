import { describe, expect, it } from "vitest";

import {
  filterFestivalParticipants,
  getMatchingStandIds,
  participantSearchEntryMatchesFilters,
  sortFestivalParticipants,
} from "@/app/components/festivals/festival-visitor-filters";
import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { EMPTY_STAND_FILTERS } from "@/app/lib/maps/stand-filters";
import type { PublicFestivalParticipant } from "@/app/components/festivals/participant-info";
import type { ParticipantSearchEntry } from "@/app/components/maps/festival-nav/festival-nav-participant-search";

const participants: PublicFestivalParticipant[] = [
  {
    id: 1,
    displayName: "Pandora",
    imageUrl: null,
    category: "illustration",
    stands: [{ id: 12, label: "A", standNumber: 2 }],
    hasStamp: false,
    isNew: false,
  },
  {
    id: 2,
    displayName: "Ámbar Creativo",
    imageUrl: null,
    category: "entrepreneurship",
    stands: [{ id: 13, label: "A", standNumber: 3 }],
    hasStamp: false,
    isNew: false,
  },
  {
    id: 3,
    displayName: "Bento",
    imageUrl: null,
    category: "gastronomy",
    stands: [{ id: 24, label: "B", standNumber: 4 }],
    hasStamp: false,
    isNew: false,
  },
];

describe("festival visitor filters", () => {
  it("matches names and stand labels without accents", () => {
    expect(
      filterFestivalParticipants({
        participants,
        query: "ambar",
        category: "all",
      }).map((participant) => participant.id),
    ).toEqual([2]);

    expect(
      filterFestivalParticipants({
        participants,
        query: "A2",
        category: "all",
      }).map((participant) => participant.id),
    ).toEqual([1]);
  });

  it("keeps query and category filters without scoping empty stands", () => {
    const unassigned: PublicFestivalParticipant = {
      id: 4,
      displayName: "Sin stand",
      imageUrl: null,
      category: "illustration",
      stands: [],
      hasStamp: false,
      isNew: false,
    };
    const withUnassigned = [...participants, unassigned];

    expect(
      filterFestivalParticipants({
        participants: withUnassigned,
        query: "",
        category: "all",
      }).map((participant) => participant.id),
    ).toEqual([1, 2, 3, 4]);

    expect(
      filterFestivalParticipants({
        participants: withUnassigned,
        query: "sin stand",
        category: "illustration",
      }).map((participant) => participant.id),
    ).toEqual([4]);

    expect(
      filterFestivalParticipants({
        participants: withUnassigned,
        query: "",
        category: "all",
        sectorStandIds: new Set([12]),
      }).map((participant) => participant.id),
    ).toEqual([1]);
  });

  it("composes category and sector filters", () => {
    expect(
      filterFestivalParticipants({
        participants,
        query: "",
        category: "gastronomy",
        sectorStandIds: new Set([24]),
      }).map((participant) => participant.id),
    ).toEqual([3]);

    expect(
      filterFestivalParticipants({
        participants,
        query: "",
        category: "gastronomy",
        sectorStandIds: new Set([12, 13]),
      }),
    ).toEqual([]);
  });

  it("uses the same category and query rules for map entries", () => {
    const entry = {
      displayName: "Pandora",
      category: "illustration",
      standLabel: "A2",
    } as ParticipantSearchEntry;

    expect(
      participantSearchEntryMatchesFilters(entry, "ilustracion", "all"),
    ).toBe(true);
    expect(
      participantSearchEntryMatchesFilters(entry, "Pandora", "gastronomy"),
    ).toBe(false);
  });
});

const activityUserIds = {
  coupon_book: new Set([1]),
  stamp_passport: new Set([3]),
  sticker_hunt: new Set<number>(),
  festival_sticker: new Set<number>(),
};

// Stand 99 is free, so no participant entry ever points at it.
const sectors = [
  {
    stands: [
      { id: 12, status: "confirmed" },
      { id: 13, status: "reserved" },
      { id: 24, status: "confirmed" },
      { id: 99, status: "available" },
      { id: 100, status: "disabled" },
    ],
  },
] as unknown as FestivalSectorWithStandsWithReservationsWithParticipants[];

const searchEntries = [
  {
    userId: 1,
    category: "illustration",
    displayName: "Pandora",
    standLabel: "A2",
    stand: { id: 12, status: "confirmed" },
  },
  {
    userId: 2,
    category: "entrepreneurship",
    displayName: "Ámbar Creativo",
    standLabel: "A3",
    stand: { id: 13, status: "reserved" },
  },
  {
    userId: 3,
    category: "gastronomy",
    displayName: "Bento",
    standLabel: "B4",
    stand: { id: 24, status: "confirmed" },
  },
] as unknown as ParticipantSearchEntry[];

function matchingStandIds(
  overrides: Partial<Parameters<typeof getMatchingStandIds>[0]> = {},
) {
  return getMatchingStandIds({
    sectors,
    searchEntries,
    query: "",
    category: "all",
    standFilters: EMPTY_STAND_FILTERS,
    activityUserIds,
    ...overrides,
  });
}

describe("getMatchingStandIds", () => {
  it("returns null when no filter is active", () => {
    expect(matchingStandIds()).toBeNull();
  });

  it("resolves status over the sectors so free stands can match", () => {
    expect(
      matchingStandIds({
        standFilters: { status: "available", activities: [] },
      }),
    ).toEqual([99]);
  });

  it("skips disabled stands when filtering by status", () => {
    expect(
      matchingStandIds({
        standFilters: { status: "occupied", activities: [] },
      }),
    ).toEqual([12, 13, 24]);
  });

  it("keeps only stands hosting a selected activity", () => {
    expect(
      matchingStandIds({
        standFilters: { status: "all", activities: ["coupon_book"] },
      }),
    ).toEqual([12]);
  });

  it("ors activities within the group", () => {
    expect(
      matchingStandIds({
        standFilters: {
          status: "all",
          activities: ["coupon_book", "stamp_passport"],
        },
      }),
    ).toEqual([12, 24]);
  });

  it("ands the status group with the participant groups", () => {
    expect(
      matchingStandIds({
        query: "Pandora",
        standFilters: { status: "available", activities: [] },
      }),
    ).toEqual([]);
  });

  it("narrows participant filters by activity", () => {
    expect(
      matchingStandIds({
        category: "gastronomy",
        standFilters: { status: "all", activities: ["stamp_passport"] },
      }),
    ).toEqual([24]);
  });
});

describe("filterFestivalParticipants activity filter", () => {
  it("keeps only participants in a selected activity", () => {
    expect(
      filterFestivalParticipants({
        participants,
        query: "",
        category: "all",
        activities: ["coupon_book"],
        activityUserIds,
      }).map((participant) => participant.id),
    ).toEqual([1]);
  });

  it("treats an empty activity selection as inactive", () => {
    expect(
      filterFestivalParticipants({
        participants,
        query: "",
        category: "all",
        activities: [],
        activityUserIds,
      }).map((participant) => participant.id),
    ).toEqual([1, 2, 3]);
  });
});

describe("sortFestivalParticipants", () => {
  it("orders by stand label then number by default", () => {
    expect(
      sortFestivalParticipants(participants, "stand").map((p) => p.id),
    ).toEqual([1, 2, 3]);
  });

  it("orders by name when asked", () => {
    expect(
      sortFestivalParticipants(participants, "name").map((p) => p.id),
    ).toEqual([2, 3, 1]);
  });

  it("compares stand numbers numerically, not as text", () => {
    const numbered = [
      {
        ...participants[0],
        id: 10,
        stands: [{ id: 1, label: "A", standNumber: 10 }],
      },
      {
        ...participants[0],
        id: 2,
        stands: [{ id: 2, label: "A", standNumber: 2 }],
      },
    ];

    expect(
      sortFestivalParticipants(numbered, "stand").map((p) => p.id),
    ).toEqual([2, 10]);
  });

  it("places a participant by their earliest stand", () => {
    const spread = [
      {
        ...participants[0],
        id: 1,
        stands: [
          { id: 1, label: "C", standNumber: 1 },
          { id: 2, label: "A", standNumber: 9 },
        ],
      },
      {
        ...participants[1],
        id: 2,
        stands: [{ id: 3, label: "B", standNumber: 1 }],
      },
    ];

    expect(sortFestivalParticipants(spread, "stand").map((p) => p.id)).toEqual([
      1, 2,
    ]);
  });

  it("sorts participants without a stand last", () => {
    const withoutStand = [
      { ...participants[0], id: 99, stands: [] },
      { ...participants[1], id: 2 },
    ];

    expect(
      sortFestivalParticipants(withoutStand, "stand").map((p) => p.id),
    ).toEqual([2, 99]);
  });

  it("leaves the given array untouched", () => {
    const original = [...participants];
    sortFestivalParticipants(participants, "name");
    expect(participants).toEqual(original);
  });
});
