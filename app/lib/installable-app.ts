import { getEnvLabel } from "@/app/lib/config";

/**
 * Glitter as an installed app (PRD in-app notifications, P2b step 0): the
 * name under its home-screen icon and the colours around it.
 */

/**
 * "Glitter", with the environment label in preview and development builds,
 * as page titles carry it, so a staging install is told apart from
 * production.
 */
export function installedAppName() {
  return `${getEnvLabel()} Glitter`.trim();
}

/**
 * The browser and status bar match the navbar: `--brand-elevated` in each
 * theme (app/globals.css).
 */
export const THEME_COLORS = { light: "#fefbf8", dark: "#1b1722" } as const;

/**
 * The purple behind the isotype in the icons, so the launch screen around
 * the icon reads as one piece.
 */
export const ICON_BACKGROUND = "#6523e7";
