"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  ThemeProvider as NextThemesProvider,
  ThemeProviderProps,
} from "next-themes";

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
      {children}
    </NextThemesProvider>
  );
}
