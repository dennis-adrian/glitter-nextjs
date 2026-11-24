import { readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, render, screen } from "@testing-library/react";
import { toast, Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import SiteChromeReady from "@/app/components/site-chrome-ready";
import {
  SITE_CHROME_READY_EVENT,
  siteToastsReady,
} from "@/app/lib/site-chrome";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SiteChromeReady", () => {
  it("says the toasts are ready only once a toast shown then appears", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const onReady = () => {
      expect(siteToastsReady()).toBe(true);
      toast("Notificación 41");
    };
    window.addEventListener(SITE_CHROME_READY_EVENT, onReady);
    const { unmount } = render(
      <>
        <Toaster />
        <SiteChromeReady />
      </>,
    );
    expect(await screen.findByText("Notificación 41")).toBeTruthy();
    window.removeEventListener(SITE_CHROME_READY_EVENT, onReady);

    act(() => unmount());
    expect(siteToastsReady()).toBe(false);
  });

  it("comes after the Toaster in the site's layout, under the same parent", () => {
    const source = readFileSync(
      path.join(__dirname, "site-chrome.tsx"),
      "utf8",
    );
    const toaster = source.indexOf("<Toaster");
    const ready = source.indexOf("<SiteChromeReady");
    expect(toaster).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(toaster);
    // No element opens or closes between them: a Suspense boundary there
    // could mount this ahead of the Toaster.
    const between = source
      .slice(toaster, ready)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(between).not.toMatch(/<\/?[A-Z][\w.]*(?![^>]*\/>)[^>]*>/);
  });
});
