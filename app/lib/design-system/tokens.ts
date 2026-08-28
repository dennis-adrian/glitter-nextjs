/**
 * Productora Glitter design tokens.
 *
 * Color and spacing values are pulled from Figma nodes 287:298 and 9:80.
 * Typography keeps the Figma scale while using the product-selected
 * Gabarito/Figtree pair.
 */
export const glitterTokens = {
  color: {
    ink: "#29005C",
    primary: "#6200CB",
    lavender: "#EAE2FF",
    coral: "#FF655B",
    elevated: "#FEFBF8",
    card: "#FFFFFF",
    neutral: "#697281",
    neutralStrong: "#0E1624",
    coralSoft: "#FFF0EE",
    border: "#F0E5FF",
    primaryScale: {
      50: "#F5F0FF",
      100: "#EDE9FE",
      200: "#DDD6FE",
      300: "#C4B5FD",
      400: "#A78BFA",
      500: "#7C3AED",
      600: "#6523E6",
      700: "#5B21B6",
      800: "#4C1D95",
      900: "#3B0E6B",
      950: "#260B5C",
    },
    neutralScale: {
      50: "#F8FAFC",
      100: "#F1F5F9",
      200: "#E2E8F0",
      300: "#CBD5E1",
      400: "#94A3B8",
      500: "#64748B",
      600: "#475569",
      700: "#334155",
      800: "#1E293B",
      900: "#0F172A",
      950: "#020617",
    },
    semantic: {
      success: { 50: "#ECFDF5", 500: "#D1FAE5", 700: "#22C55E" },
      warning: { 50: "#FFFBEB", 500: "#FEF3C7", 700: "#F59E0B" },
      error: { 50: "#FEF2F2", 500: "#FECACA", 700: "#EF4444" },
    },
    surface: {
      background: "#FAF6F0",
      card: "#FFFFFF",
      elevated: "#FCFBF9",
      muted: "#F5F1EB",
    },
  },
  spacing: {
    half: 2,
    one: 4,
    two: 8,
    three: 12,
    four: 16,
    six: 24,
  },
  radius: {
    image: 12,
    card: 20,
    cardLarge: 24,
    full: 9999,
  },
  typography: {
    displayFamily: "Gabarito",
    bodyFamily: "Figtree",
    display6xl: { size: 60, lineHeight: 60, weight: 800, tracking: -1.5 },
    display5xl: { size: 48, lineHeight: 48, weight: 800, tracking: -1 },
    display4xl: { size: 36, lineHeight: 40, weight: 800, tracking: -0.5 },
    display2xl: { size: 24, lineHeight: 32, weight: 700, tracking: 0 },
    displayXl: { size: 20, lineHeight: 28, weight: 700, tracking: 0 },
    body: { size: 16, lineHeight: 24, weight: 400, tracking: 0 },
    bodySmall: { size: 14, lineHeight: 20, weight: 400, tracking: 0 },
    bodyXs: { size: 12, lineHeight: 16, weight: 400, tracking: 0 },
  },
} as const;

export type GlitterTokens = typeof glitterTokens;
