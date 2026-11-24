"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  hasFestivalMapUrlState,
  parseFestivalMapUrlState,
  writeFestivalMapUrlState,
  type FestivalMapUrlContext,
  type FestivalMapUrlState,
} from "@/app/lib/maps/festival-map-url";

/**
 * Typing in the search box writes on every keystroke otherwise, and Safari
 * throws once a page passes ~100 history updates in a few seconds.
 */
const URL_WRITE_DELAY_MS = 250;

/**
 * The filters a shared link opens with. Read once: from then on React state
 * leads and the URL only follows it, so a click never waits on the URL.
 */
export function useInitialFestivalMapUrlState(
  context: FestivalMapUrlContext,
): FestivalMapUrlState {
  const searchParams = useSearchParams();
  const [initialState] = useState(() =>
    parseFestivalMapUrlState(searchParams, context),
  );

  return initialState;
}

/**
 * Mirrors the map's filters into the address bar so the visitor can copy and
 * share it.
 *
 * Goes through `history.replaceState` on purpose: `router.replace` with new
 * search params asks the server to render the whole festival page again, which
 * is what made filtering take seconds. The native call only updates the URL
 * (Next keeps `useSearchParams` in step), and replacing rather than pushing
 * keeps the back button leaving the page instead of stepping through every
 * chip that was tapped.
 */
export function useSyncFestivalMapUrl(
  { query, sectorIndex, standFilters }: FestivalMapUrlState,
  {
    sectors,
    includeQuery,
    anchor,
  }: Pick<FestivalMapUrlContext, "sectors" | "includeQuery"> & {
    /**
     * Section id added as the hash while any filter is on, so whoever opens
     * the link lands on the filtered map instead of the top of the page.
     * An existing hash is left alone.
     */
    anchor?: string;
  },
) {
  useEffect(() => {
    const pathname = window.location.pathname;
    const state = { query, sectorIndex, standFilters };

    const timer = window.setTimeout(() => {
      // Navigated away in the meantime: that URL belongs to another page.
      if (window.location.pathname !== pathname) return;

      const search = writeFestivalMapUrlState(window.location.search, state, {
        sectors,
        includeQuery,
      });
      const hash =
        !window.location.hash && anchor && hasFestivalMapUrlState(state)
          ? `#${anchor}`
          : window.location.hash;

      if (search === window.location.search && hash === window.location.hash) {
        return;
      }

      try {
        // `null`, not the current state: Next only syncs its router with
        // calls that do not carry its own history entry.
        window.history.replaceState(null, "", `${pathname}${search}${hash}`);
      } catch {
        // A throttled update only leaves the URL one step behind; the next
        // change writes it again.
      }
    }, URL_WRITE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [anchor, includeQuery, query, sectorIndex, sectors, standFilters]);
}
