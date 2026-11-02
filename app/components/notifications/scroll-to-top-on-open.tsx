"use client";

import { useEffect } from "react";

/**
 * An item opens at its top. Next keeps the scroll the previous screen had
 * while the new page is still in view, and otherwise brings the page's top
 * to the window's edge, behind the sticky navbar: either way the title is
 * cut. Instant, not the site's smooth scroll, so nothing slides into place.
 */
export default function ScrollToTopOnOpen({ id }: { id: number }) {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [id]);
  return null;
}
