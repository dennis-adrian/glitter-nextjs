import type { Metadata } from "next";

import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_OPEN_GRAPH_IMAGE,
  withEnvLabel,
} from "@/app/lib/site-metadata";

import { LINKS_PATH, type LinksHeader } from "./definitions";

/** The page's description when the header has no line of its own. */
export const LINKS_FALLBACK_DESCRIPTION =
  "Todos los enlaces de la Productora Glitter: tiendita, sitio web, redes sociales y contacto.";

/**
 * The site's picture as Next resolved it for the root layout, whose URL
 * carries the file's content hash, so share caches pick up a new one.
 */
type SiteImage =
  | string
  | URL
  | {
      url: string | URL;
      width?: string | number;
      height?: string | number;
      type?: string;
    };

function siteImageDescriptor(image: SiteImage) {
  if (typeof image === "string" || image instanceof URL) return { url: image };
  const { url, width, height, type } = image;
  return { url, width, height, type };
}

/**
 * `/links` as a browser tab and a share preview, from the header set in
 * `/dashboard/links`.
 *
 * The tab reads the site's name once: the header's name alone when it
 * already says it ("Productora Glitter"), followed by it otherwise ("Glitter
 * links | Productora Glitter"), with the environment's label ahead of it off
 * production.
 *
 * The preview shows the name, the line and the picture, and the site's line
 * and picture where the header has none. A picture is an avatar, square, so
 * it gets the small card; the site's picture is wide and gets the large one.
 * `siteImage` is the root layout's resolved share image, when there is one.
 */
export function linksPageMetadata(
  header: LinksHeader,
  envLabel: string,
  siteImage: SiteImage = SITE_OPEN_GRAPH_IMAGE,
): Metadata {
  const title = header.title;
  const namesSite = title.toLowerCase().includes(SITE_NAME.toLowerCase());
  const description = header.description || SITE_DESCRIPTION;
  const image = header.avatarUrl
    ? { url: header.avatarUrl, alt: title }
    : { ...siteImageDescriptor(siteImage), alt: SITE_NAME };

  return {
    title: {
      absolute: withEnvLabel(
        namesSite ? title : `${title} | ${SITE_NAME}`,
        envLabel,
      ),
    },
    description: header.description || LINKS_FALLBACK_DESCRIPTION,
    alternates: { canonical: LINKS_PATH },
    openGraph: {
      type: "website",
      url: LINKS_PATH,
      siteName: SITE_NAME,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: header.avatarUrl ? "summary" : "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
