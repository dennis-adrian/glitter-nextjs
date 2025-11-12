import { Inter } from "next/font/google";
import localFont from "next/font/local";

export const junegull = localFont({
	src: "../fonts/junegull.otf",
});

export const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
});

export const isidora = localFont({
	src: [
		{
			path: "../fonts/isidora/Isidora-Bold-Italic.otf",
			weight: "700",
			style: "italic",
		},
	],
	display: "swap",
	variable: "--font-isidora",
});
