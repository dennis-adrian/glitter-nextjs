import { Inter } from "next/font/google";
import localFont from "next/font/local";

export const junegull = localFont({
	src: "../fonts/junegull.otf",
});

export const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
});
