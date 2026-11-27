"use client";

import { useEffect } from "react";

import { countLinksView } from "@/app/components/links/visit-source";

/**
 * Counts the showing of `/links`, from the browser once the page is on
 * screen: never during server rendering (the page may come from a cache),
 * never for a crawler that runs no JavaScript, and once per page load
 * however often this renders. Draws nothing.
 */
export default function LinksViewCounter() {
  useEffect(() => {
    countLinksView();
  }, []);
  return null;
}
