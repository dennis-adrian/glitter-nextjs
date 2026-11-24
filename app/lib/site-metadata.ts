/** The name every page's title and share preview ends in or falls back to. */
export const SITE_NAME = "Productora Glitter";

/** Where relative metadata URLs (images, canonical links) resolve. */
export function siteMetadataBase(): URL {
  return new URL(
    process.env.NEXT_PUBLIC_BASE_URL || "https://www.glitter.com.bo",
  );
}

/**
 * What every share preview falls back to: the site's line and its picture
 * (`app/opengraph-image.png`, served at this path).
 */
export const SITE_DESCRIPTION =
  "Creamos festivales para que los artistas brillen";
export const SITE_OPEN_GRAPH_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  type: "image/png",
} as const;

/**
 * A browser title with the environment's label ahead of it ("[Dev] …") off
 * production, and nothing ahead of it on production.
 */
export function withEnvLabel(title: string, envLabel: string): string {
  return [envLabel, title].filter(Boolean).join(" ");
}
