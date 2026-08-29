import { Figtree, Gabarito, Inter, Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";

export const junegull = localFont({
  src: "../fonts/junegull.otf",
});

export const citrusGothicSolid = localFont({
  src: "../fonts/CitrusGothicSolid-Regular.ttf",
  display: "swap",
  variable: "--font-citrus-gothic-solid",
});

export const citrusGothicInline = localFont({
  src: "../fonts/CitrusGothicInline-Regular.ttf",
  display: "swap",
  variable: "--font-citrus-gothic-inline",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});

export const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-figtree",
});

export const gabarito = Gabarito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-gabarito",
});
