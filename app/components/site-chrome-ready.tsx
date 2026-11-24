"use client";

import { useEffect } from "react";

import {
  SITE_TOASTS_ATTRIBUTE,
  SITE_CHROME_READY_EVENT,
} from "@/app/lib/site-chrome";

/**
 * Marks the site's toasts as listening (SITE_TOASTS_ATTRIBUTE) and sends
 * SITE_CHROME_READY_EVENT. Being inside the site is the server-rendered
 * SITE_CHROME_ATTRIBUTE marker, not this. Rendered after the Toaster, under
 * the same parent: effects run in order, so by the time this one does, the
 * Toaster is listening. Renders nothing.
 */
export default function SiteChromeReady() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(SITE_TOASTS_ATTRIBUTE, "");
    window.dispatchEvent(new Event(SITE_CHROME_READY_EVENT));
    return () => root.removeAttribute(SITE_TOASTS_ATTRIBUTE);
  }, []);
  return null;
}
