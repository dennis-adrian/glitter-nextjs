import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FIRST_STANDALONE_LAUNCH_KEY,
  recordFirstStandaloneLaunch,
} from "@/app/lib/install-guide/first-launch";

/** A window that reads as the installed app, or as a browser tab. */
function page(standalone: boolean): Window & { localStorage?: Storage } {
  return {
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130" },
    matchMedia: (query: string) => ({
      matches: standalone && query === "(display-mode: standalone)",
    }),
    localStorage: window.localStorage,
  } as unknown as Window & { localStorage?: Storage };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordFirstStandaloneLaunch", () => {
  it("is false in a browser tab, and leaves no mark", () => {
    expect(recordFirstStandaloneLaunch(page(false))).toBe(false);
    expect(window.localStorage.getItem(FIRST_STANDALONE_LAUNCH_KEY)).toBeNull();
  });

  it("is true the first time the installed app opens, then never again", () => {
    const now = () => new Date("2026-11-04T12:00:00.000Z");
    expect(recordFirstStandaloneLaunch(page(true), now)).toBe(true);
    expect(window.localStorage.getItem(FIRST_STANDALONE_LAUNCH_KEY)).toBe(
      "2026-11-04T12:00:00.000Z",
    );
    expect(recordFirstStandaloneLaunch(page(true), now)).toBe(false);
    expect(recordFirstStandaloneLaunch(page(true), now)).toBe(false);
  });

  it("counts the iPhone home-screen app, which reports itself on navigator", () => {
    const iphone = {
      navigator: { standalone: true, userAgent: "iPhone" },
      localStorage: window.localStorage,
    } as unknown as Window & { localStorage?: Storage };
    expect(recordFirstStandaloneLaunch(iphone)).toBe(true);
    expect(recordFirstStandaloneLaunch(iphone)).toBe(false);
  });

  it("is false when storage is unavailable, so a launch is not counted every time", () => {
    const blocked = page(true);
    blocked.localStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    expect(recordFirstStandaloneLaunch(blocked)).toBe(false);

    const missing = page(true);
    delete missing.localStorage;
    expect(recordFirstStandaloneLaunch(missing)).toBe(false);
  });

  it("is false when the mark could not be kept", () => {
    const full = page(true);
    full.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    } as unknown as Storage;
    expect(recordFirstStandaloneLaunch(full)).toBe(false);
  });
});
