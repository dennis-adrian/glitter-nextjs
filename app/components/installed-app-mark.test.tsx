import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InstalledAppMark from "@/app/components/installed-app-mark";
import {
  INSTALLED_APP_ATTRIBUTE,
  INSTALLED_APP_SESSION_KEY,
} from "@/app/lib/installed-app-mode";
import {
  INSTALLED_APP_SEEN_PATH,
  NOTIFICATION_STATE_CACHE,
} from "@/app/lib/notifications/push/taps";

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));

const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; 23078PND5G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

let standalone = false;
let changeListener: (() => void) | null = null;
const cachePut = vi.fn<(key: string, response: Response) => Promise<void>>(
  async () => {},
);
const cacheOpen = vi.fn<(name: string) => Promise<{ put: typeof cachePut }>>(
  async () => ({ put: cachePut }),
);

function marked() {
  return document.documentElement.hasAttribute(INSTALLED_APP_ATTRIBUTE);
}

beforeEach(() => {
  standalone = false;
  changeListener = null;
  pathnameMock.mockReturnValue("/portal");
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return standalone && query === "(display-mode: standalone)";
      },
      addEventListener: (_type: string, listener: () => void) => {
        changeListener = listener;
      },
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal("caches", { open: cacheOpen });
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ANDROID);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cachePut.mockClear();
  cacheOpen.mockClear();
  window.sessionStorage.clear();
  document.documentElement.removeAttribute(INSTALLED_APP_ATTRIBUTE);
});

describe("InstalledAppMark", () => {
  it("puts the mark back on <html> after a navigation", () => {
    window.sessionStorage.setItem(INSTALLED_APP_SESSION_KEY, "browser");
    const { rerender } = render(<InstalledAppMark />);
    expect(marked()).toBe(true);

    // React re-created <html> without the attribute it never rendered.
    document.documentElement.removeAttribute(INSTALLED_APP_ATTRIBUTE);
    pathnameMock.mockReturnValue("/merch");
    rerender(<InstalledAppMark />);

    expect(marked()).toBe(true);
  });

  it("tells the worker an Android phone runs the app in browser mode", async () => {
    window.sessionStorage.setItem(INSTALLED_APP_SESSION_KEY, "browser");
    render(<InstalledAppMark />);

    await waitFor(() => expect(cachePut).toHaveBeenCalledTimes(1));
    expect(cacheOpen).toHaveBeenCalledWith(NOTIFICATION_STATE_CACHE);
    const [key, response] = cachePut.mock.calls[0];
    expect(key).toBe(INSTALLED_APP_SEEN_PATH);
    expect(await response.json()).toEqual({ at: expect.any(Number) });
  });

  it("tells the worker nothing about a window the display mode already covers, or off Android", async () => {
    window.sessionStorage.setItem(INSTALLED_APP_SESSION_KEY, "standalone");
    standalone = true;
    render(<InstalledAppMark />);
    cleanup();

    window.sessionStorage.setItem(INSTALLED_APP_SESSION_KEY, "browser");
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0 Safari/537.36",
    );
    render(<InstalledAppMark />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cachePut).not.toHaveBeenCalled();
  });

  it("takes the mark away when a standalone window moves into a browser tab", () => {
    window.sessionStorage.setItem(INSTALLED_APP_SESSION_KEY, "standalone");
    standalone = true;
    render(<InstalledAppMark />);
    expect(marked()).toBe(true);

    standalone = false;
    changeListener?.();

    expect(marked()).toBe(false);
    expect(window.sessionStorage.getItem(INSTALLED_APP_SESSION_KEY)).toBeNull();
  });

  it("keeps a browser-mode mark whatever the display mode says", () => {
    window.sessionStorage.setItem(INSTALLED_APP_SESSION_KEY, "browser");
    render(<InstalledAppMark />);
    changeListener?.();

    expect(marked()).toBe(true);
  });

  it("leaves an unmarked window alone", () => {
    render(<InstalledAppMark />);
    expect(marked()).toBe(false);
    expect(cacheOpen).not.toHaveBeenCalled();
  });
});
