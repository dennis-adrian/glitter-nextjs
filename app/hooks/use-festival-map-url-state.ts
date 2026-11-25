"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  hasFestivalMapUrlState,
  parseFestivalMapUrlState,
  writeFestivalMapUrlState,
  type FestivalMapUrlContext,
  type FestivalMapUrlState,
} from "@/app/lib/maps/festival-map-url";

/**
 * Typing in the search box would otherwise write on every keystroke. Safari
 * throws a SecurityError past 100 history updates in a short window (30s in
 * older releases, 10s in newer ones); at one write per 250ms a page stays well
 * under that.
 */
const URL_WRITE_DELAY_MS = 250;

/** One string per URL, in the shape both Next's hooks and our writes produce. */
function locationKey(pathname: string, search: string) {
  return `${pathname}?${search.replace(/^\?/, "")}`;
}

/**
 * The filters a shared link opens with. From then on React state leads and the
 * URL only follows it, so a click never waits on the URL;
 * `useSyncFestivalMapUrl` hands back any later URL it did not write itself.
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
 * share it, and picks up a URL someone else changed.
 *
 * Writes go through `history.replaceState` on purpose. `router.replace` with
 * new search params is a navigation: on this dynamic page the client waits
 * while the server renders the page again (one RSC request and every query
 * the page makes), which is what made URL-driven filtering slow. The native
 * call only updates the URL, and Next keeps `useSearchParams` in step (see
 * "Native History API" in Next's linking-and-navigating docs). Replacing
 * rather than pushing keeps the back button leaving the page instead of
 * stepping through every chip that was tapped.
 *
 * A link to this same page with other filters is a client navigation that
 * keeps this component mounted, so its initial state would go stale; worse, the
 * pending write would put the old filters back over the link's URL. Any URL
 * this hook did not write is read back through `onExternalChange` instead.
 */
export function useSyncFestivalMapUrl(
  { query, sectorIndex, standFilters }: FestivalMapUrlState,
  {
    anchor,
    onExternalChange,
    ...context
  }: FestivalMapUrlContext & {
    /**
     * Section id added as the hash while any filter is on, so whoever opens
     * the link lands on the filtered map instead of the top of the page.
     * An existing hash is left alone.
     */
    anchor?: string;
    /** Called during render with the filters of a URL that came from elsewhere. */
    onExternalChange: (state: FestivalMapUrlState) => void;
  },
) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const location = locationKey(pathname, searchParams.toString());
  const [seenLocation, setSeenLocation] = useState(location);
  const [ownLocation, setOwnLocation] = useState<string | null>(null);

  // Adjusted during render rather than in an effect, so the page never paints
  // the new URL with the old filters.
  if (location !== seenLocation) {
    setSeenLocation(location);
    // The marker answers for one URL change only: the render that shows our
    // own write consumes it, and any other URL clears it. Left in place, it
    // would swallow a later link back to the URL it names.
    if (ownLocation !== null) setOwnLocation(null);
    if (location !== ownLocation) {
      onExternalChange(parseFestivalMapUrlState(searchParams, context));
    }
  }

  const { sectors, includeQuery } = context;

  useEffect(() => {
    const scheduledPathname = window.location.pathname;
    const scheduledSearch = window.location.search;
    const state = { query, sectorIndex, standFilters };

    const timer = window.setTimeout(() => {
      // The URL moved on since this write was scheduled (another page, or a
      // link to this one with other filters): it is not ours to overwrite.
      if (
        window.location.pathname !== scheduledPathname ||
        window.location.search !== scheduledSearch
      ) {
        return;
      }

      const search = writeFestivalMapUrlState(scheduledSearch, state, {
        sectors,
        includeQuery,
      });
      const hash =
        !window.location.hash && anchor && hasFestivalMapUrlState(state)
          ? `#${anchor}`
          : window.location.hash;

      if (search === scheduledSearch && hash === window.location.hash) {
        return;
      }

      try {
        // Recorded first, so the render Next triggers for this URL already
        // knows it came from here. Only when the search changes: a hash-only
        // write changes nothing Next reports, so no render would consume it.
        if (search !== scheduledSearch) {
          setOwnLocation(locationKey(scheduledPathname, search));
        }
        // `null`, not the current state: Next only syncs its router with
        // calls that do not carry its own history entry.
        window.history.replaceState(
          null,
          "",
          `${scheduledPathname}${search}${hash}`,
        );
      } catch {
        // A throttled update only leaves the URL one step behind; the next
        // change writes it again.
      }
    }, URL_WRITE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [anchor, includeQuery, query, sectorIndex, sectors, standFilters]);
}
