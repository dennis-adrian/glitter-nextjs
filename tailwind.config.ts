import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { withUt } from "uploadthing/tw";

const config = withUt({
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: "2rem",
			screens: {
				"2xl": "1400px",
			},
		},
		extend: {
			screens: {
				xxs: "320px",
				xs: "375px",
			},
			colors: {
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				background: {
					"50": "hsl(var(--background-50))",
					"100": "hsl(var(--background-100))",
					"200": "hsl(var(--background-200))",
					"300": "hsl(var(--background-300))",
					"400": "hsl(var(--background-400))",
					"500": "hsl(var(--background-500))",
					"600": "hsl(var(--background-600))",
					"700": "hsl(var(--background-700))",
					"800": "hsl(var(--background-800))",
					"900": "hsl(var(--background-900))",
					"950": "hsl(var(--background-950))",
					DEFAULT: "hsl(var(--background))",
				},
				foreground: "hsl(var(--foreground))",
				primary: {
					"50": "hsl(var(--primary-50))",
					"100": "hsl(var(--primary-100))",
					"200": "hsl(var(--primary-200))",
					"300": "hsl(var(--primary-300))",
					"400": "hsl(var(--primary-400))",
					"500": "hsl(var(--primary-500))",
					"600": "hsl(var(--primary-600))",
					"700": "hsl(var(--primary-700))",
					"800": "hsl(var(--primary-800))",
					"900": "hsl(var(--primary-900))",
					"950": "hsl(var(--primary-950))",
					DEFAULT: "hsl(var(--primary))",
					foreground: "hsl(var(--primary-foreground))",
				},
				secondary: {
					"50": "hsl(var(--secondary-50))",
					"100": "hsl(var(--secondary-100))",
					"200": "hsl(var(--secondary-200))",
					"300": "hsl(var(--secondary-300))",
					"400": "hsl(var(--secondary-400))",
					"500": "hsl(var(--secondary-500))",
					"600": "hsl(var(--secondary-600))",
					"700": "hsl(var(--secondary-700))",
					"800": "hsl(var(--secondary-800))",
					"900": "hsl(var(--secondary-900))",
					"950": "hsl(var(--secondary-950))",
					DEFAULT: "hsl(var(--secondary))",
					foreground: "hsl(var(--secondary-foreground))",
				},
				destructive: {
					DEFAULT: "hsl(var(--destructive))",
					foreground: "hsl(var(--destructive-foreground))",
				},
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-foreground))",
				},
				accent: {
					"50": "hsl(var(--accent-50))",
					"100": "hsl(var(--accent-100))",
					"200": "hsl(var(--accent-200))",
					"300": "hsl(var(--accent-300))",
					"400": "hsl(var(--accent-400))",
					"500": "hsl(var(--accent-500))",
					"600": "hsl(var(--accent-600))",
					"700": "hsl(var(--accent-700))",
					"800": "hsl(var(--accent-800))",
					"900": "hsl(var(--accent-900))",
					"950": "hsl(var(--accent-950))",
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-foreground))",
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))",
				},
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				"glitter-blue": {
					"50": "var(--glitter-blue-50)",
					"100": "var(--glitter-blue-100)",
					"200": "var(--glitter-blue-200)",
					"300": "var(--glitter-blue-300)",
					"400": "var(--glitter-blue-400)",
					"500": "var(--glitter-blue-500)",
					"600": "var(--glitter-blue-600)",
					"700": "var(--glitter-blue-700)",
					"800": "var(--glitter-blue-800)",
					"900": "var(--glitter-blue-900)",
					"950": "var(--glitter-blue-950)",
				},
				festicker: {
					DEFAULT: "#FB0A76",
					foreground: "#FFFFFF",
				},
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
			keyframes: {
				"accordion-down": {
					from: {
						height: "0",
					},
					to: {
						height: "var(--radix-accordion-content-height)",
					},
				},
				"accordion-up": {
					from: {
						height: "var(--radix-accordion-content-height)",
					},
					to: {
						height: "0",
					},
				},
				expand: {
					"0%": {
						transform: "scale(0.95)",
						opacity: "0",
					},
					"100%": {
						transform: "scale(1)",
						opacity: "1",
					},
				},
				"slide-up": {
					"0%": {
						transform: "translateY(50px)",
						opacity: "0",
					},
					"100%": {
						transform: "translateY(0)",
						opacity: "1",
					},
				},
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
				expand: "expand 0.3s ease-out",
				"slide-up": "slide-up 0.5s ease-out",
			},
			fontFamily: {
				sans: ["var(--font-inter)"],
			},
			textShadow: {
				sm: "3px 3px 3px var(--tw-shadow-color)",
				DEFAULT: "6px 6px 3px var(--tw-shadow-color)",
				lg: "8px 8px 4px var(--tw-shadow-color)",
			},
		},
	},
	plugins: [
		require("tailwindcss-animate"),
		plugin(function ({ matchUtilities, theme }) {
			matchUtilities(
				{
					"text-shadow": (value) => ({
						textShadow: value,
					}),
				},
				{ values: theme("textShadow") },
			);
		}),
	],
} satisfies Config);

export default config;
