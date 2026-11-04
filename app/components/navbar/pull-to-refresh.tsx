"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  APP_REFRESH_EVENT,
  canStartPull,
  isReadyToRefresh,
  PULL_SLOP,
  pullDistance,
  pullProgress,
} from "@/app/components/navbar/pull-refresh";
import { isStandaloneApp } from "@/app/lib/notifications/push/support";
import { cn } from "@/app/lib/utils";

/** The shortest the spinner turns, so a fast refresh still reads as one. */
const MIN_SPIN_MS = 600;
const RING = 2 * Math.PI * 9;

type Phase = "idle" | "pulling" | "refreshing";

/**
 * Pull to refresh, for the installed app only: a browser tab already
 * reloads on pull, and a home-screen app on iPhone has no way to refresh at
 * all. At the top of a page, pulling down moves the page with the finger and
 * fills a ring under the header; releasing past the threshold refreshes the
 * page's data in place (router.refresh: what was typed and the scroll stay)
 * and tells widgets that fetch their own data, like the bell, to fetch again.
 */
export default function PullToRefresh() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [distance, setDistance] = useState(0);
  const [top, setTop] = useState(0);
  const [isPending, startTransition] = useTransition();
  const startedAt = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  // The gesture's listeners live for the component's whole life; a new
  // router object must not tear them down mid-pull.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!isStandaloneApp(window as Parameters<typeof isStandaloneApp>[0])) {
      return;
    }

    let startY: number | null = null;
    let startX = 0;
    let pulling = false;
    let current = 0;
    let frame = 0;

    const main = () => document.querySelector<HTMLElement>("body > main");
    let settle = 0;
    // Moved with relative positioning, not a transform: a transform would
    // become the box of every fixed element inside the page (payment bars,
    // checkout actions) and send them off-screen while pulling.
    const move = (value: number, animate: boolean) => {
      const element = main();
      if (!element) return;
      window.clearTimeout(settle);
      element.style.transition = animate ? "top 200ms ease-out" : "";
      element.style.position = value || animate ? "relative" : "";
      element.style.top = value ? `${value}px` : "";
      if (!value && animate) {
        // Back to static once it has settled, as the page was, unless a new
        // pull has moved it again meanwhile.
        settle = window.setTimeout(() => {
          if (element.style.top) return;
          element.style.position = "";
          element.style.transition = "";
        }, 220);
      }
    };

    const reset = () => {
      // Only a pull that moved the page has anything to put back: a touch
      // that never pulled (a tap, a cancelled scroll) leaves it alone.
      const moved = pulling || current > 0;
      startY = null;
      pulling = false;
      current = 0;
      cancelAnimationFrame(frame);
      if (!moved) return;
      setDistance(0);
      if (phaseRef.current === "pulling") setPhase("idle");
      move(0, true);
    };

    const zoomed = () => {
      const visual = window.visualViewport;
      return Boolean(visual && (visual.scale > 1.01 || visual.offsetTop > 0));
    };

    const onStart = (event: TouchEvent) => {
      // A second finger is a pinch: whatever was pulling lets go.
      if (event.touches.length !== 1) {
        if (startY !== null) reset();
        return;
      }
      if (phaseRef.current === "refreshing") return;
      // A zoomed-in page pans with drags, even at its top.
      if (window.scrollY > 0 || zoomed()) return;
      if (!canStartPull(event.target, document)) return;
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
      const chrome = document.querySelector("[data-site-navbar]");
      setTop(chrome ? Math.max(0, chrome.getBoundingClientRect().bottom) : 0);
    };

    const onMove = (event: TouchEvent) => {
      if (startY === null || event.touches.length !== 1) return;
      const dy = event.touches[0].clientY - startY;
      const dx = event.touches[0].clientX - startX;
      if (!pulling) {
        const downward = dy > 0 && Math.abs(dy) >= Math.abs(dx);
        // Claim a downward drag at the top from its first move, so the
        // browser never starts its own overscroll in its place.
        if (downward && event.cancelable) event.preventDefault();
        // The direction is decided once the finger has really moved: a
        // finger lands with a pixel or two of wobble either way.
        if (Math.hypot(dx, dy) < PULL_SLOP) return;
        if (!downward || window.scrollY > 0 || zoomed()) {
          startY = null;
          return;
        }
        pulling = true;
        setPhase("pulling");
      }
      // Back above where it started: the pull is off and scrolling is back.
      if (dy <= 0) {
        reset();
        return;
      }
      // The page is ours while pulling: no rubber band, no browser refresh.
      if (event.cancelable) event.preventDefault();
      current = pullDistance(dy - PULL_SLOP);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setDistance(current);
        move(current, false);
      });
    };

    const onEnd = (event: TouchEvent) => {
      if (startY === null) return;
      // Only the last finger lifting ends the gesture.
      if (event.touches && event.touches.length > 0) return;
      if (pulling && isReadyToRefresh(current)) {
        startY = null;
        pulling = false;
        cancelAnimationFrame(frame);
        startedAt.current = Date.now();
        setPhase("refreshing");
        window.dispatchEvent(new Event(APP_REFRESH_EVENT));
        startTransition(() => routerRef.current.refresh());
        return;
      }
      reset();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      move(0, false);
    };
  }, []);

  // Settle once the refresh is done and the spinner has turned a moment.
  useEffect(() => {
    if (phase !== "refreshing" || isPending) return;
    const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - startedAt.current));
    const timer = window.setTimeout(() => {
      setPhase("idle");
      setDistance(0);
      const element = document.querySelector<HTMLElement>("body > main");
      if (element) {
        element.style.transition = "top 200ms ease-out";
        element.style.top = "";
        // Back to static once it has settled, as the page was.
        window.setTimeout(() => {
          if (!element.style.top) element.style.position = "";
        }, 220);
      }
    }, wait);
    return () => window.clearTimeout(timer);
  }, [isPending, phase]);

  if (phase === "idle") return null;

  const refreshing = phase === "refreshing";
  const progress = refreshing ? 1 : pullProgress(distance);
  // The ring slides down from under the header with the page.
  const offset = refreshing ? Math.max(distance, 48) : distance;

  return (
    <div
      aria-hidden="true"
      data-pull-indicator=""
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      style={{
        top: top + offset / 2 - 20,
        opacity: Math.min(1, progress * 1.5),
      }}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-brand-card shadow-md">
        <svg
          viewBox="0 0 24 24"
          className={cn(
            "size-6",
            refreshing && "animate-spin motion-reduce:animate-none",
          )}
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            className="stroke-brand-lavender"
            strokeWidth="2.5"
          />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            className="stroke-brand-primary"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${(refreshing ? 0.75 : progress) * RING} ${RING}`}
            transform="rotate(-90 12 12)"
          />
        </svg>
      </span>
    </div>
  );
}
