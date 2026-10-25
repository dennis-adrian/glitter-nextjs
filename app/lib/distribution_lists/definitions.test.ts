import { describe, expect, it } from "vitest";

import {
  audienceCountLine,
  CreateDistributionListSchema,
  DistributionListFilterV1,
  DistributionListNameSchema,
  EMPTY_DISTRIBUTION_LIST_FILTER,
  expandDistributionListAreas,
  isEmptyDistributionListFilter,
  parseStoredDistributionListFilter,
  STATE_VALUES,
} from "@/app/lib/distribution_lists/definitions";
import { stateOptions } from "@/app/lib/utils";

describe("DistributionListFilterV1", () => {
  it("fills every attribute's default, so `{ v: 1 }` is everyone", () => {
    const filter = DistributionListFilterV1.parse({ v: 1 });
    expect(filter).toEqual(EMPTY_DISTRIBUTION_LIST_FILTER);
    expect(isEmptyDistributionListFilter(filter)).toBe(true);
  });

  it("drops repeated values", () => {
    expect(
      DistributionListFilterV1.parse({
        v: 1,
        areas: ["gastronomy", "gastronomy"],
        subcategoryIds: [3, 3, 4],
        states: ["La Paz", "La Paz"],
        confirmedAtFestivalIds: [7, 7],
      }),
    ).toMatchObject({
      areas: ["gastronomy"],
      subcategoryIds: [3, 4],
      states: ["La Paz"],
      confirmedAtFestivalIds: [7],
    });
  });

  it("counts excluding paused people as a filter", () => {
    expect(
      isEmptyDistributionListFilter(
        DistributionListFilterV1.parse({ v: 1, includePaused: false }),
      ),
    ).toBe(false);
  });

  it.each([
    ["an unknown field", { v: 1, tags: [1] }],
    ["another version", { v: 2 }],
    ["no version", { areas: [] }],
    ["the deprecated category", { v: 1, areas: ["new_artist"] }],
    ["a departamento that is not one", { v: 1, states: ["Lima"] }],
    [
      "a festival id that is not a serial",
      { v: 1, confirmedAtFestivalIds: [0] },
    ],
    [
      "too many subcategories",
      { v: 1, subcategoryIds: Array.from({ length: 31 }, (_, i) => i + 1) },
    ],
  ])("refuses %s", (_case, value) => {
    expect(DistributionListFilterV1.safeParse(value).success).toBe(false);
  });
});

describe("parseStoredDistributionListFilter", () => {
  it("reads a stored filter", () => {
    expect(
      parseStoredDistributionListFilter({ v: 1, states: ["Oruro"] }),
    ).toMatchObject({ states: ["Oruro"] });
  });

  it.each([null, undefined, "x", [], { v: 1, gender: "female" }])(
    "returns null for %j, never an empty filter that would mean everyone",
    (stored) => {
      expect(parseStoredDistributionListFilter(stored)).toBeNull();
    },
  );
});

describe("expandDistributionListAreas", () => {
  it("lets illustration match the deprecated new_artist category", () => {
    expect(expandDistributionListAreas(["illustration"])).toEqual([
      "illustration",
      "new_artist",
    ]);
    expect(expandDistributionListAreas(["gastronomy"])).toEqual(["gastronomy"]);
    expect(expandDistributionListAreas([])).toEqual([]);
  });
});

describe("STATE_VALUES", () => {
  it("are the departamentos a profile can pick", () => {
    expect(STATE_VALUES).toEqual(stateOptions.map((option) => option.value));
    expect(STATE_VALUES).toHaveLength(9);
  });
});

describe("DistributionListNameSchema", () => {
  it("trims and accepts up to 60 characters", () => {
    expect(DistributionListNameSchema.parse("  Ilustración La Paz ")).toBe(
      "Ilustración La Paz",
    );
    expect(DistributionListNameSchema.safeParse("x".repeat(60)).success).toBe(
      true,
    );
    expect(DistributionListNameSchema.safeParse("x".repeat(61)).success).toBe(
      false,
    );
    expect(DistributionListNameSchema.safeParse("   ").success).toBe(false);
  });

  it("keeps the Confirmados prefix for festival lists", () => {
    expect(
      DistributionListNameSchema.safeParse("Confirmados · Navidad").success,
    ).toBe(false);
    expect(
      DistributionListNameSchema.safeParse("confirmados · navidad").success,
    ).toBe(false);
    expect(
      DistributionListNameSchema.safeParse("Confirmados de Navidad").success,
    ).toBe(true);
  });
});

describe("CreateDistributionListSchema", () => {
  it("takes a filter for a filter list and members for a fixed one", () => {
    expect(
      CreateDistributionListSchema.parse({
        kind: "filter",
        name: "Gastronomía",
        filter: { v: 1, areas: ["gastronomy"] },
      }),
    ).toMatchObject({ kind: "filter", description: null });
    expect(
      CreateDistributionListSchema.parse({
        kind: "fixed",
        name: "Voluntarios",
        description: "  ",
        memberIds: [5, 5, 6],
      }),
    ).toMatchObject({ kind: "fixed", description: null, memberIds: [5, 6] });
  });

  it("refuses a filter list without a filter", () => {
    expect(
      CreateDistributionListSchema.safeParse({ kind: "filter", name: "X" })
        .success,
    ).toBe(false);
  });
});

describe("audienceCountLine", () => {
  it("adds who cannot receive it only when there is someone", () => {
    expect(audienceCountLine({ eligible: 312, skipped: 8 })).toBe(
      "Pueden recibirlo hoy: 312 · 8 no lo reciben",
    );
    expect(audienceCountLine({ eligible: 0, skipped: 0 })).toBe(
      "Pueden recibirlo hoy: 0",
    );
  });
});
