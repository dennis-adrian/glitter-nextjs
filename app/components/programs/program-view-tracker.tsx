"use client";

import posthog from "posthog-js";
import { useEffect, useRef } from "react";

import type { PostHogEvent } from "@/app/lib/posthog-events";

type Props = {
  event: PostHogEvent;
  /**
   * Serializable only — this crosses the server/client boundary. Keep values
   * low-cardinality where they will be used as breakdowns.
   */
  properties?: Record<string, string | number | boolean | null>;
};

/**
 * Fires one view event per mount from an otherwise server-rendered page.
 *
 * Renders nothing and takes no layout, so it can sit anywhere in the tree. The
 * program and session pages are `force-static`; this still runs, because the
 * capture happens in the browser after hydration.
 *
 * Guarded by a ref rather than an empty dependency array alone: React re-runs
 * effects on every mount, and a remount inside the same page would otherwise
 * double-count the view.
 */
export default function ProgramViewTracker({ event, properties }: Props) {
  const captured = useRef(false);

  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    posthog.capture(event, properties);
    // Properties are derived from the page's own data and never change without
    // a navigation, which remounts this component anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  return null;
}
