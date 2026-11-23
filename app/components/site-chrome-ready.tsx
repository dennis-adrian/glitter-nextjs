"use client";

import { useEffect } from "react";

import {
  SITE_CHROME_ATTRIBUTE,
  SITE_CHROME_READY_EVENT,
} from "@/app/lib/site-chrome";

/**
 * Marks the page as inside the site's layout (see SITE_CHROME_ATTRIBUTE).
 * Rendered after the Toaster: effects run in order, so by the time this one
 * does, the Toaster is listening. Renders nothing.
 */
export default function SiteChromeReady() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(SITE_CHROME_ATTRIBUTE, "");
    window.dispatchEvent(new Event(SITE_CHROME_READY_EVENT));
    return () => root.removeAttribute(SITE_CHROME_ATTRIBUTE);
  }, []);
  return null;
}
