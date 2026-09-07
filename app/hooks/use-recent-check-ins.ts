"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { RecentCheckIn } from "@/app/components/dashboard/programs/checkin/checkin-recent-list";
import {
  NO_RECENT_CHECK_INS,
  clearRecentCheckIns,
  getRecentCheckIns,
  setRecentCheckIns,
  subscribeToRecentCheckIns,
} from "@/app/lib/programs/checkin-recent-storage";

/** How far back the history goes. Bounded so a long night cannot grow without limit. */
const RECENT_LIMIT = 50;

type RecentCheckIns = {
  items: RecentCheckIn[];
  /** Records one scan, trimming the oldest once the list is full. */
  add: (result: RecentCheckIn["result"]) => void;
  clear: () => void;
};

/**
 * The recent-scan list for one occurrence, backed by `sessionStorage`.
 *
 * `useSyncExternalStore` rather than state restored in an effect: the panel is
 * server-pre-rendered, so the first render has no storage to read and must
 * agree with the server. Passing `NO_RECENT_CHECK_INS` as the server snapshot
 * is what lets React hydrate against an empty list and then swap in the stored
 * one, instead of us forcing it with a `setState` that would cascade.
 */
export default function useRecentCheckIns(
  occurrenceId: number,
): RecentCheckIns {
  const items = useSyncExternalStore(
    subscribeToRecentCheckIns,
    useCallback(() => getRecentCheckIns(occurrenceId), [occurrenceId]),
    () => NO_RECENT_CHECK_INS,
  );

  const add = useCallback(
    (result: RecentCheckIn["result"]) => {
      const current = getRecentCheckIns(occurrenceId);

      /**
       * Derived from the list rather than a counter, so a restored history and
       * the scans that follow it cannot collide on an id — which React would
       * see as duplicate keys.
       */
      const id = current.reduce((highest, item) => {
        return item.id > highest ? item.id : highest;
      }, 0);

      const entry: RecentCheckIn = { id: id + 1, at: new Date(), result };
      setRecentCheckIns(
        occurrenceId,
        [entry, ...current].slice(0, RECENT_LIMIT),
      );
    },
    [occurrenceId],
  );

  const clear = useCallback(() => {
    clearRecentCheckIns(occurrenceId);
  }, [occurrenceId]);

  return useMemo(() => ({ items, add, clear }), [items, add, clear]);
}
