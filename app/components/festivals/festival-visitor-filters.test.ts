import { describe, expect, it } from "vitest";

import {
  filterFestivalParticipants,
  participantSearchEntryMatchesFilters,
} from "@/app/components/festivals/festival-visitor-filters";
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
