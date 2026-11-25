import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useInitialFestivalMapUrlState,
  useSyncFestivalMapUrl,
} from "@/app/hooks/use-festival-map-url-state";
import type {
  FestivalMapUrlContext,
  FestivalMapUrlState,
} from "@/app/lib/maps/festival-map-url";
import { EMPTY_STAND_FILTERS } from "@/app/lib/maps/stand-filters";

// Stands in for Next's router: the hooks read whatever URL it last settled on.
let routerUrl = new URL("http://localhost/festivals/489");
vi.mock("next/navigation", () => ({
  useSearchParams: () => routerUrl.searchParams,
  usePathname: () => routerUrl.pathname,
}));

/** What Next does after any URL change: its hooks pick up the new URL. */
function syncRouterToWindow() {
  routerUrl = new URL(window.location.href);
}

/** A <Link> to the same page with other params: Next pushes and re-renders. */
function navigateTo(path: string) {
  window.history.pushState(null, "", path);
  syncRouterToWindow();
}

const context: FestivalMapUrlContext = {
  sectors: [{ id: 10 }, { id: 20 }],
  selectableStatuses: ["occupied", "available"],
  selectableActivities: ["coupon_book", "stamp_passport"],
  includeQuery: true,
};
const defaultState: FestivalMapUrlState = {
  query: "",
  sectorIndex: -1,
  standFilters: EMPTY_STAND_FILTERS,
};

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/festivals/489");
  syncRouterToWindow();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Renders the sync hook alone, with state passed in by the test. */
function renderSync(
  initialState: Partial<FestivalMapUrlState> = {},
  extra: { anchor?: string; onExternalChange?: () => void } = {},
) {
  return renderHook(
    (state: FestivalMapUrlState) =>
      useSyncFestivalMapUrl(state, {
        ...context,
        onExternalChange: extra.onExternalChange ?? vi.fn(),
        anchor: extra.anchor,
      }),
    { initialProps: { ...defaultState, ...initialState } },
  );
}

/** Wired the way both pages wire it: URL state in, state out, both hooks. */
function renderConsumer() {
  const onExternalChange = vi.fn();
  const hook = renderHook(() => {
    const initial = useInitialFestivalMapUrlState(context);
    const [state, setState] = useState(initial);
    useSyncFestivalMapUrl(state, {
      ...context,
      onExternalChange: (next) => {
        onExternalChange(next);
        setState(next);
      },
    });
    return { state, setState };
  });
  return { ...hook, onExternalChange };
}

describe("useInitialFestivalMapUrlState", () => {
  it("reads the link it opens with", () => {
    navigateTo("/festivals/489?sector=20&activity=coupon_book");
    const { result } = renderHook(() => useInitialFestivalMapUrlState(context));

    expect(result.current.sectorIndex).toBe(1);
    expect(result.current.standFilters.activities).toEqual(["coupon_book"]);
  });
});

describe("useSyncFestivalMapUrl writes", () => {
  it("replaces the URL after a short delay, keeping history length", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");

    renderSync({
      standFilters: { status: "all", activities: ["stamp_passport"] },
    });

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
    const { rerender } = renderSync({ query: "P" });

    rerender({ ...defaultState, query: "Pa" });
    rerender({ ...defaultState, query: "Pan" });
    act(() => vi.advanceTimersByTime(250));

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?q=Pan");
  });

  it("adds the anchor while filtered and keeps an existing hash", () => {
    const { rerender } = renderSync({}, { anchor: "mapa" });

    act(() => vi.advanceTimersByTime(250));
    expect(window.location.hash).toBe("");

    rerender({ ...defaultState, sectorIndex: 0 });
    act(() => vi.advanceTimersByTime(250));
    expect(window.location.search).toBe("?sector=10");
    expect(window.location.hash).toBe("#mapa");

    window.history.replaceState(
      null,
      "",
      "/festivals/489?sector=10#participantes",
    );
    rerender({ ...defaultState, sectorIndex: 1 });
    act(() => vi.advanceTimersByTime(250));
    expect(window.location.hash).toBe("#participantes");
  });

  it("skips the write when the URL already matches", () => {
    navigateTo("/festivals/489?sector=10");
    const replaceState = vi.spyOn(window.history, "replaceState");

    renderSync({ sectorIndex: 0 });
    act(() => vi.advanceTimersByTime(250));

    expect(replaceState).not.toHaveBeenCalled();
  });

  it("does not write onto another page after navigating away", () => {
    renderSync({ sectorIndex: 0 });
    window.history.pushState(null, "", "/festivals/489/map");
    const replaceState = vi.spyOn(window.history, "replaceState");
    act(() => vi.advanceTimersByTime(250));

    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });
});

describe("useSyncFestivalMapUrl and link taps", () => {
  /** A link whose own (bubble-phase) handler notes the URL it navigates from. */
  function appendLink(href: string) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = "Ver perfil";
    const seenByLink: string[] = [];
    link.addEventListener("click", (event) => {
      event.preventDefault();
      seenByLink.push(window.location.search);
    });
    document.body.append(link);
    return { link, seenByLink };
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("writes a pending URL before a tapped link starts navigating", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderSync({ query: "Ana" });
    const { link, seenByLink } = appendLink("/public_profiles/7");

    act(() => vi.advanceTimersByTime(100));
    link.click();

    // Out before the link's own handler, not 150ms later in its way.
    expect(seenByLink).toEqual(["?q=Ana"]);
    expect(replaceState).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(250));
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting when the tap is not on a link", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderSync({ query: "Ana" });
    const button = document.createElement("button");
    document.body.append(button);

    act(() => vi.advanceTimersByTime(100));
    button.click();
    expect(replaceState).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(150));
    expect(replaceState).toHaveBeenCalledTimes(1);
  });
});

describe("useSyncFestivalMapUrl and URLs from elsewhere", () => {
  it("applies a same-path navigation to the mounted filters", () => {
    navigateTo("/festivals/489?activity=coupon_book");
    const { result, rerender, onExternalChange } = renderConsumer();
    expect(result.current.state.standFilters.activities).toEqual([
      "coupon_book",
    ]);

    navigateTo(
      "/festivals/489?sector=20&status=occupied&activity=stamp_passport",
    );
    rerender();

    expect(onExternalChange).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({
      query: "",
      sectorIndex: 1,
      standFilters: { status: "occupied", activities: ["stamp_passport"] },
    });
  });

  it("clears the filters when the link has none", () => {
    navigateTo("/festivals/489?sector=10&q=Pandora");
    const { result, rerender } = renderConsumer();

    navigateTo("/festivals/489");
    rerender();

    expect(result.current.state).toEqual(defaultState);
  });

  it("re-reads the same filters on another festival's page", () => {
    navigateTo("/festivals/489?sector=10");
    const { rerender, onExternalChange } = renderConsumer();

    navigateTo("/festivals/490?sector=10");
    rerender();

    expect(onExternalChange).toHaveBeenCalledTimes(1);
  });

  it("does not read its own writes back", () => {
    const { result, rerender, onExternalChange } = renderConsumer();

    act(() =>
      result.current.setState({
        ...defaultState,
        standFilters: { status: "all", activities: ["coupon_book"] },
      }),
    );
    act(() => vi.advanceTimersByTime(250));
    expect(window.location.search).toBe("?activity=coupon_book");

    // Next re-renders with the URL the hook just wrote.
    syncRouterToWindow();
    rerender();

    expect(onExternalChange).not.toHaveBeenCalled();
    expect(result.current.state.standFilters.activities).toEqual([
      "coupon_book",
    ]);
  });

  it("follows a link back to a URL it wrote earlier", () => {
    const { result, rerender, onExternalChange } = renderConsumer();

    // The hook writes sector 10, and Next re-renders with it.
    act(() => result.current.setState({ ...defaultState, sectorIndex: 0 }));
    act(() => vi.advanceTimersByTime(250));
    expect(window.location.search).toBe("?sector=10");
    syncRouterToWindow();
    rerender();
    expect(onExternalChange).not.toHaveBeenCalled();

    navigateTo("/festivals/489?sector=20");
    rerender();
    expect(result.current.state.sectorIndex).toBe(1);

    // Back to the URL the hook wrote itself: still a link, still applied.
    navigateTo("/festivals/489?sector=10");
    rerender();
    expect(onExternalChange).toHaveBeenCalledTimes(2);
    expect(result.current.state.sectorIndex).toBe(0);
  });

  it("follows a link back after a write that only added the anchor", () => {
    navigateTo("/festivals/489?sector=10");
    const onExternalChange = vi.fn();
    const { result, rerender } = renderHook(() => {
      const initial = useInitialFestivalMapUrlState(context);
      const [state, setState] = useState(initial);
      useSyncFestivalMapUrl(state, {
        ...context,
        anchor: "mapa",
        onExternalChange: (next) => {
          onExternalChange(next);
          setState(next);
        },
      });
      return state;
    });

    // The search already matches, so this write only adds #mapa.
    act(() => vi.advanceTimersByTime(250));
    expect(window.location.hash).toBe("#mapa");

    navigateTo("/festivals/489?sector=20");
    rerender();
    navigateTo("/festivals/489?sector=10");
    rerender();

    expect(onExternalChange).toHaveBeenCalledTimes(2);
    expect(result.current.sectorIndex).toBe(0);
  });

  it("does not overwrite a link followed while a write was pending", () => {
    const { result, rerender } = renderConsumer();

    act(() => result.current.setState({ ...defaultState, sectorIndex: 0 }));
    // Within the write delay, the visitor follows a link with other filters.
    navigateTo("/festivals/489?activity=stamp_passport");
    rerender();
    act(() => vi.advanceTimersByTime(250));

    expect(window.location.search).toBe("?activity=stamp_passport");
    expect(result.current.state).toEqual({
      ...defaultState,
      standFilters: { status: "all", activities: ["stamp_passport"] },
    });
  });
});
