import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_COLORS } from "@/app/lib/theme-colors";

const theme = vi.hoisted(() => ({
  resolvedTheme: "light" as string | undefined,
  forcedTheme: undefined as string | undefined,
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
  useTheme: () => theme,
}));

import { ThemeProvider } from "@/app/components/theme-provider";

/** The tags the root layout renders, one per device colour scheme. */
function themeColorMetas() {
  for (const media of [
    "(prefers-color-scheme: light)",
    "(prefers-color-scheme: dark)",
  ]) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.media = media;
    meta.content = media.includes("dark")
      ? THEME_COLORS.dark
      : THEME_COLORS.light;
    document.head.append(meta);
  }
  return () =>
    [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
      meta.getAttribute("content"),
    );
}

describe("the browser bar colour", () => {
  beforeEach(() => {
    theme.resolvedTheme = "light";
    theme.forcedTheme = undefined;
  });

  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
  });

  it("follows Oscuro picked in Glitter, whatever the device says", () => {
    const contents = themeColorMetas();
    theme.resolvedTheme = "dark";
    render(<ThemeProvider>page</ThemeProvider>);
    expect(contents()).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);
  });

  it("follows Claro picked in Glitter on a dark device", () => {
    const contents = themeColorMetas();
    render(<ThemeProvider>page</ThemeProvider>);
    expect(contents()).toEqual([THEME_COLORS.light, THEME_COLORS.light]);
  });

  it("stays light on a page that forces it, such as the print views", () => {
    const contents = themeColorMetas();
    theme.resolvedTheme = "dark";
    theme.forcedTheme = "light";
    render(<ThemeProvider>page</ThemeProvider>);
    expect(contents()).toEqual([THEME_COLORS.light, THEME_COLORS.light]);
  });

  it("leaves the device's choice alone until the theme is known", () => {
    const contents = themeColorMetas();
    theme.resolvedTheme = undefined;
    render(<ThemeProvider>page</ThemeProvider>);
    expect(contents()).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
  });
});
