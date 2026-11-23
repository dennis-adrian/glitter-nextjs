/**
 * Share images whose address changed when their pages moved into the `(site)`
 * route group. Next suffixes an image route inside a group with a hash of its
 * folder's path, and that path now starts with `(site)`, so every suffix
 * changed. Sites that cached a preview may fetch the old address again;
 * these rewrites keep answering it with the image.
 *
 * `folder` is where the image lives today, under app/, and gives the new
 * suffix (see share-image-routes.test.ts).
 */
export const LEGACY_SHARE_IMAGE_ROUTES = [
  {
    folder: "(site)/(routes)/voluntarios",
    source: "/voluntarios/opengraph-image-1tikjg",
    destination: "/voluntarios/opengraph-image-19xfjl",
  },
  {
    folder: "(site)/(routes)/(storefront)/merch/collections/[slug]",
    source: "/merch/collections/:slug/opengraph-image-17ro6i",
    destination: "/merch/collections/:slug/opengraph-image-1t3m94",
  },
] as const;
