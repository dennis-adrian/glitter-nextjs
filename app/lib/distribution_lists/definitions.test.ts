import { describe, expect, it } from "vitest";

import {
  audienceCountLine,
  copiedMessage,
  defaultCopyName,
  DuplicateDistributionListSchema,
  PullDistributionListSchema,
  pulledMessage,
  removedByHandText,
  CreateDistributionListSchema,
  DistributionListFilterV1,
  DistributionListNameSchema,
  EMPTY_DISTRIBUTION_LIST_FILTER,
  expandDistributionListAreas,
  isEmptyDistributionListFilter,
  parseStoredDistributionListFilter,
  STATE_VALUES,
  UpdateDistributionListSchema,
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

  it("says in Spanish which limit was passed", () => {
    const tooMany = DistributionListFilterV1.safeParse({
      v: 1,
      confirmedAtFestivalIds: Array.from({ length: 21 }, (_, i) => i + 1),
    });
    expect(tooMany.success).toBe(false);
    expect(tooMany.error?.issues[0]?.message).toBe(
      "Elegí hasta 20 festivales en «Con reserva confirmada en».",
    );
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
    const filter = CreateDistributionListSchema.parse({
      kind: "filter",
      name: "Gastronomía",
      filter: { v: 1, areas: ["gastronomy"] },
    });
    expect(filter).toMatchObject({ kind: "filter" });
    expect(filter.description).toBeUndefined();
    expect(
      CreateDistributionListSchema.parse({
        kind: "fixed",
        name: "Voluntarios",
        description: "  ",
        memberIds: [5, 5, 6],
      }),
    ).toMatchObject({ kind: "fixed", description: null, memberIds: [5, 6] });
  });

  it("keeps a left-out description, and clears a blank one", () => {
    const base = { listId: 1, name: "Lista" };
    expect(
      UpdateDistributionListSchema.parse(base).description,
    ).toBeUndefined();
    expect(
      UpdateDistributionListSchema.parse({ ...base, description: " " })
        .description,
    ).toBeNull();
    expect(
      UpdateDistributionListSchema.parse({ ...base, description: null })
        .description,
    ).toBeNull();
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
    expect(audienceCountLine({ eligible: 2, skipped: 1 })).toBe(
      "Pueden recibirlo hoy: 2 · 1 no lo recibe",
    );
  });
});

describe("duplicating and pulling (B10)", () => {
  it("names a copy «Copia de …», cut to fit and valid for a Confirmados source", () => {
    expect(defaultCopyName("Confirmados · Glitter Navidad")).toBe(
      "Copia de Confirmados · Glitter Navidad",
    );
    const long = defaultCopyName("x".repeat(80));
    expect(long).toHaveLength(60);
    expect(
      DuplicateDistributionListSchema.safeParse({
        source: { kind: "festival", festivalId: 1 },
        name: defaultCopyName("Confirmados · Glitter"),
      }).success,
    ).toBe(true);
    expect(
      DuplicateDistributionListSchema.safeParse({
        source: { kind: "festival", festivalId: 1 },
        name: "Confirmados · Glitter",
      }).success,
    ).toBe(false);
    expect(
      DuplicateDistributionListSchema.safeParse({
        source: { kind: "list" },
        name: "Copia",
      }).success,
    ).toBe(false);
  });

  it("takes up to a full list of ticked people, deduped, and needs one", () => {
    expect(
      PullDistributionListSchema.parse({ listId: 1, userIds: [2, 2, 3] }),
    ).toEqual({ listId: 1, userIds: [2, 3], includeRemoved: false });
    expect(
      PullDistributionListSchema.safeParse({ listId: 1, userIds: [] }).success,
    ).toBe(false);
    expect(
      PullDistributionListSchema.safeParse({
        listId: 1,
        userIds: Array.from({ length: 3_001 }, (_, i) => i + 1),
      }).success,
    ).toBe(false);
  });

  it("words the copy, the pull and the removed line", () => {
    expect(copiedMessage(312, "Confirmados · Glitter", 0)).toBe(
      "Copiamos 312 personas de «Confirmados · Glitter».",
    );
    expect(copiedMessage(1, "Ilustración", 1)).toBe(
      "Copiamos 1 persona de «Ilustración». 1 no es participante y no se copió.",
    );
    expect(copiedMessage(1_240, "Ilustración", 2)).toBe(
      "Copiamos 1.240 personas de «Ilustración». 2 no son participantes y no se copiaron.",
    );
    expect(pulledMessage(4, "Ilustración", 0)).toBe(
      "Agregamos 4 personas de «Ilustración».",
    );
    expect(pulledMessage(1, "Ilustración", 2)).toBe(
      "Agregamos 1 persona de «Ilustración». 2 ya no estaban para agregar.",
    );
    expect(removedByHandText(1)).toBe("1 quitado a mano no se agrega");
    expect(removedByHandText(3)).toBe("3 quitados a mano no se agregan");
  });
});
