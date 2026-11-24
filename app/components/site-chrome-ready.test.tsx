import { readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, render, screen } from "@testing-library/react";
import { toast, Toaster } from "sonner";
import ts from "typescript";
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
    const file = path.join(__dirname, "site-chrome.tsx");
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const elements = new Map<string, ts.Node>();
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node)) {
        elements.set(node.tagName.getText(source), node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    const toaster = elements.get("Toaster");
    const ready = elements.get("SiteChromeReady");
    if (!toaster || !ready)
      throw new Error("Toaster or SiteChromeReady missing");
    // Siblings, so no Suspense boundary can mount one without the other.
    expect(ready.parent).toBe(toaster.parent);
    expect(ready.pos).toBeGreaterThan(toaster.pos);
  });
});
