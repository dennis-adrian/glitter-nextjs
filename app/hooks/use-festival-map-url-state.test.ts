import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useInitialFestivalMapUrlState,
  useSyncFestivalMapUrl,
} from "@/app/hooks/use-festival-map-url-state";
import type { FestivalMapUrlState } from "@/app/lib/maps/festival-map-url";
import { EMPTY_STAND_FILTERS } from "@/app/lib/maps/stand-filters";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

const sectors = [{ id: 10 }, { id: 20 }];
const defaultState: FestivalMapUrlState = {
  query: "",
  sectorIndex: -1,
  standFilters: EMPTY_STAND_FILTERS,
};

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/festivals/489");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useInitialFestivalMapUrlState", () => {
  it("reads the link once and ignores later URL changes", () => {
    searchParams = new URLSearchParams("?sector=20&activity=coupon_book");
    const { result, rerender } = renderHook(() =>
      useInitialFestivalMapUrlState({
        sectors,
        selectableStatuses: ["occupied"],
        selectableActivities: ["coupon_book"],
        includeQuery: true,
      }),
    );

    expect(result.current.sectorIndex).toBe(1);
    expect(result.current.standFilters.activities).toEqual(["coupon_book"]);

    searchParams = new URLSearchParams();
    rerender();
    expect(result.current.sectorIndex).toBe(1);
  });
});

describe("useSyncFestivalMapUrl", () => {
  it("replaces the URL after a short delay, keeping history length", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");

    renderHook(() =>
      useSyncFestivalMapUrl(
        {
          ...defaultState,
          standFilters: { status: "all", activities: ["stamp_passport"] },
        },
        { sectors, includeQuery: true },
      ),
    );

    expect(replaceState).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(window.location.pathname + window.location.search).toBe(
      "/festivals/489?activity=stamp_passport",
    );
  });

  it("writes once for a burst of changes", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { rerender } = renderHook(
      ({ query }) =>
        useSyncFestivalMapUrl(
          { ...defaultState, query },
          { sectors, includeQuery: true },
        ),
      { initialProps: { query: "P" } },
    );

    rerender({ query: "Pa" });
    rerender({ query: "Pan" });
    act(() => vi.advanceTimersByTime(250));

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?q=Pan");
  });

  it("adds the anchor while filtered and keeps an existing hash", () => {
    const { rerender } = renderHook(
      ({ sectorIndex }) =>
        useSyncFestivalMapUrl(
          { ...defaultState, sectorIndex },
          { sectors, includeQuery: true, anchor: "mapa" },
        ),
      { initialProps: { sectorIndex: -1 } },
    );

    act(() => vi.advanceTimersByTime(250));
    expect(window.location.hash).toBe("");

    rerender({ sectorIndex: 0 });
    act(() => vi.advanceTimersByTime(250));
    expect(window.location.search).toBe("?sector=10");
    expect(window.location.hash).toBe("#mapa");

    window.history.replaceState(
      null,
      "",
      "/festivals/489?sector=10#participantes",
    );
    rerender({ sectorIndex: 1 });
    act(() => vi.advanceTimersByTime(250));
    expect(window.location.hash).toBe("#participantes");
  });

  it("skips the write when the URL already matches", () => {
    window.history.replaceState(null, "", "/festivals/489?sector=10");
    const replaceState = vi.spyOn(window.history, "replaceState");

    renderHook(() =>
      useSyncFestivalMapUrl(
        { ...defaultState, sectorIndex: 0 },
        { sectors, includeQuery: true },
      ),
    );
    act(() => vi.advanceTimersByTime(250));

    expect(replaceState).not.toHaveBeenCalled();
  });

  it("does not write onto another page after navigating away", () => {
    renderHook(() =>
      useSyncFestivalMapUrl(
        { ...defaultState, sectorIndex: 0 },
        { sectors, includeQuery: true },
      ),
    );
    window.history.pushState(null, "", "/festivals/489/map");
    const replaceState = vi.spyOn(window.history, "replaceState");
    act(() => vi.advanceTimersByTime(250));

    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });
});
