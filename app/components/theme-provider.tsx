"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  ThemeProvider as NextThemesProvider,
  ThemeProviderProps,
  useTheme,
} from "next-themes";

import { THEME_COLORS } from "@/app/lib/theme-colors";

// next-themes renders an inline <script> that sets the theme class before
// first paint. React 19 warns whenever a component renders an executable
// script on the client, so the tag is only executable in the server HTML,
// which is where it runs; next-themes already suppresses the hydration diff.
const scriptProps = {
  type: typeof window === "undefined" ? "text/javascript" : "text/plain",
};

// Print documents end up on paper (and in the coupon book PDF export), so they
// stay light whatever theme the person viewing them has picked.
const LIGHT_ONLY_PATH_PREFIXES = ["/couponbook-print"];

/**
 * The server HTML picks the browser bar's colour by the device's light or
 * dark setting; once the page knows the theme Glitter actually shows (the
 * person may have chosen Claro or Oscuro), the bar follows that instead, so
 * it always matches the navbar.
 */
function ThemeColorSync() {
  const { resolvedTheme, forcedTheme } = useTheme();
  const pathname = usePathname();
  const theme = forcedTheme ?? resolvedTheme;

  React.useEffect(() => {
    if (theme !== "light" && theme !== "dark") return;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute("content", THEME_COLORS[theme]);
    }
    // A navigation can re-render the head's tags; set them again after one.
  }, [theme, pathname]);

  return null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const pathname = usePathname();
  const forcedTheme = LIGHT_ONLY_PATH_PREFIXES.some((prefix) =>
    pathname?.startsWith(prefix),
  )
    ? "light"
    : undefined;

  return (
    <NextThemesProvider
      scriptProps={scriptProps}
      forcedTheme={forcedTheme}
      {...props}
    >
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}
