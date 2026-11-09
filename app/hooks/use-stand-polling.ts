"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LatestRequest } from "@/app/lib/reservations/latest-request";
import {
  STAND_STATUS_POLL_INTERVAL_MS,
  STAND_STATUS_STALE_AFTER_MS,
  isNewerPollVersion,
  nextPollBackoffMs,
  type StandStatusPollResult,
} from "@/app/lib/stands/status-poll";

export type { StandStatusPollResult };

export function useStandPolling(
  sectorId: number | null,
  intervalMs: number = STAND_STATUS_POLL_INTERVAL_MS,
  onUpdate: (result: StandStatusPollResult) => void,
): { stale: boolean; pollNow: () => void } {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const [stale, setStale] = useState(false);
  const [staleSectorId, setStaleSectorId] = useState(sectorId);
  if (sectorId !== staleSectorId) {
    setStaleSectorId(sectorId);
    setStale(false);
  }
  const inFlightRef = useRef(false);
  const appliedVersionRef = useRef(0);
  const lastSuccessAtRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const failureCountRef = useRef(0);
  const trackerRef = useRef(new LatestRequest());
  // Set by the effect for the current sector; `pollNow` calls through it.
  const pollNowRef = useRef<(() => void) | null>(null);
  // A `pollNow` that arrived mid-flight: one extra poll once it lands.
  const queuedRef = useRef(false);

  const markStaleIfNeeded = useCallback(() => {
    const anchor = lastSuccessAtRef.current ?? startedAtRef.current;
    if (anchor != null && Date.now() - anchor >= STAND_STATUS_STALE_AFTER_MS) {
      setStale(true);
    }
  }, []);

  useEffect(() => {
    if (!sectorId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingStaleDeadline: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    trackerRef.current = new LatestRequest();
    appliedVersionRef.current = 0;
    lastSuccessAtRef.current = null;
    startedAtRef.current = Date.now();
    failureCountRef.current = 0;
    inFlightRef.current = false;
    queuedRef.current = false;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const clearPendingStaleDeadline = () => {
      if (pendingStaleDeadline) {
        clearTimeout(pendingStaleDeadline);
        pendingStaleDeadline = null;
      }
    };

    const armPendingStaleDeadline = () => {
      clearPendingStaleDeadline();
      pendingStaleDeadline = setTimeout(() => {
        if (!cancelled) setStale(true);
      }, STAND_STATUS_STALE_AFTER_MS);
    };

    const schedule = (delay: number) => {
      if (cancelled) return;
      clearTimer();
      timer = setTimeout(() => {
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (cancelled || document.hidden) return;
      if (inFlightRef.current) return;

      controller?.abort();
      const ac = new AbortController();
      controller = ac;
      const token = trackerRef.current.next();
      inFlightRef.current = true;
      armPendingStaleDeadline();

      try {
        const res = await fetch(`/api/stands/status?sectorId=${sectorId}`, {
          signal: ac.signal,
          cache: "no-store",
        });
        if (!trackerRef.current.isCurrent(token) || cancelled) return;
        if (!res.ok) throw new Error(`stand-status ${res.status}`);
        const data = (await res.json()) as StandStatusPollResult;
        if (!trackerRef.current.isCurrent(token) || cancelled) return;
        clearPendingStaleDeadline();
        if (!isNewerPollVersion(data.version, appliedVersionRef.current)) {
          failureCountRef.current = 0;
          lastSuccessAtRef.current = Date.now();
          setStale(false);
          schedule(intervalMs);
          return;
        }
        appliedVersionRef.current = data.version;
        failureCountRef.current = 0;
        lastSuccessAtRef.current = Date.now();
        setStale(false);
        onUpdateRef.current(data);
        schedule(intervalMs);
      } catch (error) {
        if (ac.signal.aborted || cancelled) return;
        clearPendingStaleDeadline();
        failureCountRef.current += 1;
        markStaleIfNeeded();
        console.error("Stand polling error", error);
        schedule(nextPollBackoffMs(failureCountRef.current, intervalMs));
      } finally {
        if (trackerRef.current.isCurrent(token)) {
          inFlightRef.current = false;
          if (queuedRef.current && !cancelled) {
            queuedRef.current = false;
            void poll();
          }
        }
      }
    };

    // No clearTimer() first: every completing poll reschedules, and
    // `schedule` replaces the pending timer. A hidden tab makes it a no-op.
    pollNowRef.current = () => {
      if (cancelled) return;
      if (inFlightRef.current) {
        queuedRef.current = true;
        return;
      }
      void poll();
    };

    void poll();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
        clearPendingStaleDeadline();
        controller?.abort();
        inFlightRef.current = false;
        queuedRef.current = false;
        return;
      }
      void poll();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      pollNowRef.current = null;
      queuedRef.current = false;
      clearTimer();
      clearPendingStaleDeadline();
      controller?.abort();
      inFlightRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sectorId, intervalMs, markStaleIfNeeded]);

  /** Poll now, outside the timer; coalesced to one in flight + one queued. */
  const pollNow = useCallback(() => pollNowRef.current?.(), []);

  return { stale, pollNow };
}
