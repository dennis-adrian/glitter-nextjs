"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Opens every new screen at its top.
 *
 * Next scrolls to the top on navigation only when the new page's first
 * element is out of view. It measures that against the viewport, not the
 * sticky header, so a page opened while the previous one was scrolled by
 * less than the header's height kept that offset, with its first lines
 * hidden under the header. This runs after Next's own handling and settles
 * what it left: a forward navigation to another path lands at the top.
 * Back and forward keep the browser's restored position, and a link to an
 * anchor keeps Next's scroll to it.
 */
export default function ScrollToTopOnNavigation() {
  const pathname = usePathname() ?? "/";
  const lastPathname = useRef<string | null>(null);
  const traversing = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      // A hash-only move never renders a new path, so it must not leave the
      // mark set for the next real navigation.
      if (window.location.pathname !== lastPathname.current) {
        traversing.current = true;
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Layout effect: before paint, and after the children's own layout effects
  // (Next's scroll handler among them), so it never flashes the offset page.
  useLayoutEffect(() => {
    const previous = lastPathname.current;
    lastPathname.current = pathname;
    const wasTraversal = traversing.current;
    traversing.current = false;
    // The first document: the browser places it.
    if (previous === null || previous === pathname) return;
    if (wasTraversal || window.location.hash) return;
    // Instant: the site scrolls smoothly, and a new screen must not slide.
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
