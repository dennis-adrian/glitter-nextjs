import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_BOOT_SCRIPT } from "@/app/lib/theme-boot";
import { THEME_COLORS } from "@/app/lib/theme-colors";

function deviceIsDark(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? dark : false,
    media: query,
  }));
}

function run() {
  // The script runs from a string in <head>, as the browser would run it.
  new Function(THEME_BOOT_SCRIPT)();
}

describe("THEME_BOOT_SCRIPT", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    document.head.innerHTML = `
      <meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}">
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}">`;
    window.history.replaceState(null, "", "/portal");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The case behind the light status bar over a dark app on iOS.
  it("shows the chosen dark theme on a phone set to light", () => {
    deviceIsDark(false);
    localStorage.setItem("theme", "dark");

    run();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    for (const tag of document.querySelectorAll('meta[name="theme-color"]')) {
      expect(tag.getAttribute("content")).toBe(THEME_COLORS.dark);
    }
  });

  it("shows the chosen light theme on a phone set to dark", () => {
    deviceIsDark(true);
    localStorage.setItem("theme", "light");

    run();

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    for (const tag of document.querySelectorAll('meta[name="theme-color"]')) {
      expect(tag.getAttribute("content")).toBe(THEME_COLORS.light);
    }
  });

  it("follows the device when nothing was chosen, or Sistema was", () => {
    deviceIsDark(true);
    run();
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    localStorage.setItem("theme", "system");
    deviceIsDark(false);
    run();
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("keeps print pages light", () => {
    deviceIsDark(true);
    localStorage.setItem("theme", "dark");
    window.history.replaceState(null, "", "/couponbook-print/3/5");

    run();

    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("never breaks the page when storage is blocked", () => {
    deviceIsDark(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(run).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
