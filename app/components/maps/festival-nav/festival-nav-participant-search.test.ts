import { describe, expect, it } from "vitest";

import {
  fieldMatchesQuery,
  fieldSimilarity,
  normalizeParticipantSearch,
  rankParticipantSearchEntries,
  trigramSimilarity,
  type ParticipantSearchEntry,
} from "@/app/components/maps/festival-nav/festival-nav-participant-search";

function entry(
  displayName: string,
  standLabel: string,
  overrides: Partial<ParticipantSearchEntry> = {},
): ParticipantSearchEntry {
  return {
    userId: Math.random(),
    category: "illustration",
    displayName,
    imageUrl: null,
    standLabel,
    sectorName: "Lobby",
    sectorIndex: 0,
    stand: { id: Math.random() } as ParticipantSearchEntry["stand"],
    ...overrides,
  };
}

const names = (entries: ParticipantSearchEntry[]) =>
  entries.map((match) => match.displayName);

describe("normalizeParticipantSearch", () => {
  it("folds accents and case", () => {
    expect(normalizeParticipantSearch("Ámbar Creativo")).toBe("ambarcreativo");
    expect(normalizeParticipantSearch("GÉNESIS")).toBe("genesis");
  });

  it("collapses separators so a spaced-out name is reachable as one word", () => {
    expect(normalizeParticipantSearch("K A H O R I")).toBe("kahori");
    expect(normalizeParticipantSearch("KAHORI")).toBe("kahori");
    expect(normalizeParticipantSearch("kahori")).toBe(
      normalizeParticipantSearch("K A H O R I"),
    );
  });

  it("drops punctuation from names and stand labels alike", () => {
    expect(normalizeParticipantSearch("Génesis • Design & Illustration")).toBe(
      "genesisdesignillustration",
    );
    expect(normalizeParticipantSearch("A-1")).toBe("a1");
    expect(normalizeParticipantSearch(" a 1 ")).toBe("a1");
  });

  it("keeps letters outside the latin alphabet searchable", () => {
    expect(normalizeParticipantSearch("カホリ")).toBe("カホリ");
    expect(normalizeParticipantSearch("Ку-ку")).toBe("куку");
  });
});

describe("trigramSimilarity", () => {
  it("scores identical and empty values at the extremes", () => {
    expect(trigramSimilarity("pixul", "pixul")).toBe(1);
    expect(trigramSimilarity("", "pixul")).toBe(0);
    expect(trigramSimilarity("pixul", "")).toBe(0);
  });

  it("scores a one-letter typo as Jaccard over padded trigrams", () => {
    // "  pixul " and "  pixel " share {"  p", " pi", "pix"} of 9 distinct grams.
    expect(trigramSimilarity("pixul", "pixel")).toBeCloseTo(1 / 3, 5);
  });

  it("gives unrelated words nothing", () => {
    expect(trigramSimilarity("bento", "pandora")).toBe(0);
  });
});

describe("fieldSimilarity", () => {
  it("scores a word inside a long name on that word, not the whole string", () => {
    const name = "Génesis • Design & Illustration";

    // Jaccard against the whole collapsed name is hopeless for a short query.
    expect(
      trigramSimilarity(normalizeParticipantSearch(name), "design"),
    ).toBeLessThan(0.2);
    expect(fieldSimilarity(name, "design")).toBe(1);
    expect(fieldSimilarity(name, "desing")).toBeGreaterThanOrEqual(0.3);
  });
});

describe("fieldMatchesQuery", () => {
  it("matches literal substrings", () => {
    expect(fieldMatchesQuery("Ámbar Creativo", "ambar")).toBe(true);
    expect(fieldMatchesQuery("A1", "a1")).toBe(true);
  });

  it("matches through a typo once the query is long enough to judge", () => {
    expect(fieldMatchesQuery("Pixul", "pixel")).toBe(true);
    // Four characters is below the floor: too little signal, too much noise.
    expect(fieldMatchesQuery("Arte en personajes", "arre")).toBe(false);
  });

  it("rejects an unrelated field", () => {
    expect(fieldMatchesQuery("Bento", "pandora")).toBe(false);
  });
});

describe("rankParticipantSearchEntries", () => {
  const entries = [
    entry("Pixul", "A1"),
    entry("Jn 143", "A10"),
    entry("Rox TV", "A12"),
    entry("K A H O R I", "C8"),
    entry("Génesis • Design & Illustration", "A6"),
    entry("Taiga design", "D11"),
    entry("Ana Medinacelli", "B2"),
    entry("HANANA", "D15"),
    entry("Bento", "B4"),
  ];

  it("returns nothing for an empty query", () => {
    expect(rankParticipantSearchEntries(entries, "")).toEqual([]);
    expect(rankParticipantSearchEntries(entries, "   ")).toEqual([]);
  });

  it("finds a spaced-out name however the visitor spells it", () => {
    for (const query of ["KAHORI", "kahori", "k a h o r i", "Kahori"]) {
      expect(names(rankParticipantSearchEntries(entries, query))).toEqual([
        "K A H O R I",
      ]);
    }
  });

  it("puts the stand a visitor typed ahead of stands that merely contain it", () => {
    expect(names(rankParticipantSearchEntries(entries, "a1"))).toEqual([
      "Pixul", // stand A1 exactly
      "Jn 143", // A10
      "Rox TV", // A12
    ]);
  });

  it("reads a stand written with a separator as the same stand", () => {
    expect(names(rankParticipantSearchEntries(entries, "A-1"))).toEqual(
      names(rankParticipantSearchEntries(entries, "a1")),
    );
  });

  it("ranks a name that starts with the query above one that contains it", () => {
    expect(names(rankParticipantSearchEntries(entries, "ana"))).toEqual([
      "Ana Medinacelli",
      "HANANA",
    ]);
  });

  it("keeps an approximate hit below every literal one", () => {
    const ranked = names(rankParticipantSearchEntries(entries, "design"));

    // Both hold the word literally; "desing" would reach them only fuzzily.
    expect(ranked).toEqual(["Génesis • Design & Illustration", "Taiga design"]);
    expect(names(rankParticipantSearchEntries(entries, "desing"))).toEqual(
      expect.arrayContaining(["Génesis • Design & Illustration"]),
    );
  });

  it("reaches a misspelt name nothing matches literally", () => {
    expect(names(rankParticipantSearchEntries(entries, "pixel"))).toEqual([
      "Pixul",
    ]);
  });

  it("returns every match, leaving the cap to the caller", () => {
    const crowd = Array.from({ length: 30 }, (_, index) =>
      entry(`Ana ${index}`, `Z${index}`),
    );

    expect(rankParticipantSearchEntries(crowd, "ana")).toHaveLength(30);
  });
});
