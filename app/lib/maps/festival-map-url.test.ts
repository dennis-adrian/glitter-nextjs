import { describe, expect, it } from "vitest";

import {
  hasFestivalMapUrlState,
  parseFestivalMapUrlState,
  writeFestivalMapUrlState,
  type FestivalMapUrlContext,
} from "@/app/lib/maps/festival-map-url";
import { EMPTY_STAND_FILTERS } from "@/app/lib/maps/stand-filters";

const context: FestivalMapUrlContext = {
  sectors: [{ id: 10 }, { id: 20 }],
  selectableStatuses: ["occupied", "available"],
  selectableActivities: ["coupon_book", "stamp_passport"],
  includeQuery: true,
};

function parse(search: string, overrides: Partial<FestivalMapUrlContext> = {}) {
  return parseFestivalMapUrlState(new URLSearchParams(search), {
    ...context,
    ...overrides,
  });
}

describe("parseFestivalMapUrlState", () => {
  it("opens on the default view without params", () => {
    expect(parse("")).toEqual({
      query: "",
      sectorIndex: -1,
      standFilters: EMPTY_STAND_FILTERS,
    });
  });

  it("reads the sector by id, the status, the activities and the query", () => {
    expect(
      parse(
        "?sector=20&status=occupied&activity=stamp_passport&activity=coupon_book&q=Pandora",
      ),
    ).toEqual({
      query: "Pandora",
      sectorIndex: 1,
      // Canonical order, whatever order the link listed them in.
      standFilters: {
        status: "occupied",
        activities: ["coupon_book", "stamp_passport"],
      },
    });
  });

  it("drops a sector the festival no longer has", () => {
    expect(parse("?sector=99").sectorIndex).toBe(-1);
    expect(parse("?sector=abc").sectorIndex).toBe(-1);
  });

  it("drops unknown or unselectable activities and statuses", () => {
    expect(
      parse("?status=sold&activity=sticker_hunt&activity=nope").standFilters,
    ).toEqual(EMPTY_STAND_FILTERS);
    expect(
      parse("?status=available", { selectableStatuses: ["occupied"] })
        .standFilters,
    ).toEqual(EMPTY_STAND_FILTERS);
  });

  it("drops activities when the link asks for available stands", () => {
    expect(
      parse("?status=available&activity=coupon_book").standFilters,
    ).toEqual({ status: "available", activities: [] });
  });

  it("ignores the query where the page has no text filter", () => {
    expect(parse("?q=Pandora", { includeQuery: false }).query).toBe("");
  });
});

describe("writeFestivalMapUrlState", () => {
  const writeContext = { sectors: context.sectors, includeQuery: true };

  it("writes nothing for the default view", () => {
    expect(
      writeFestivalMapUrlState(
        "",
        { query: "", sectorIndex: -1, standFilters: EMPTY_STAND_FILTERS },
        writeContext,
      ),
    ).toBe("");
  });

  it("writes every filter and round-trips through the parser", () => {
    const state = {
      query: " Ámbar ",
      sectorIndex: 0,
      standFilters: {
        status: "occupied" as const,
        activities: ["stamp_passport" as const, "coupon_book" as const],
      },
    };
    const search = writeFestivalMapUrlState("", state, writeContext);

    expect(search).toBe(
      "?q=%C3%81mbar&sector=10&status=occupied&activity=coupon_book&activity=stamp_passport",
    );
    expect(parse(search)).toEqual({
      ...state,
      query: "Ámbar",
      standFilters: {
        status: "occupied",
        activities: ["coupon_book", "stamp_passport"],
      },
    });
  });

  it("keeps parameters the map does not own and clears its own", () => {
    expect(
      writeFestivalMapUrlState(
        "?utm_source=ig&sector=10&activity=coupon_book&q=x",
        { query: "", sectorIndex: -1, standFilters: EMPTY_STAND_FILTERS },
        writeContext,
      ),
    ).toBe("?utm_source=ig");
  });

  it("leaves a `q` it does not own alone", () => {
    expect(
      writeFestivalMapUrlState(
        "?q=x",
        { query: "", sectorIndex: -1, standFilters: EMPTY_STAND_FILTERS },
        { ...writeContext, includeQuery: false },
      ),
    ).toBe("?q=x");
  });
});

describe("hasFestivalMapUrlState", () => {
  it("is false only for the default view", () => {
    const base = {
      query: "",
      sectorIndex: -1,
      standFilters: EMPTY_STAND_FILTERS,
    };
    expect(hasFestivalMapUrlState(base)).toBe(false);
    expect(hasFestivalMapUrlState({ ...base, query: "  " })).toBe(false);
    expect(hasFestivalMapUrlState({ ...base, sectorIndex: 0 })).toBe(true);
    expect(
      hasFestivalMapUrlState({
        ...base,
        standFilters: { status: "all", activities: ["coupon_book"] },
      }),
    ).toBe(true);
  });
});
