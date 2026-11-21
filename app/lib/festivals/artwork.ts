/**
 * Formats festival artwork (the poster and both banners) may be uploaded in.
 * The site shows them through next/image, which serves its own format.
 *
 * WebP is allowed by choice, at a cost: the visitor invitation email embeds
 * the poster (or, without one, the wide banner) as uploaded, and Outlook for
 * Windows cannot show WebP. SVG stays out: Gmail cannot show it.
 *
 * Shared by the upload fields and the UploadThing route, so the picker and
 * the server refuse the same files.
 */
export const FESTIVAL_ARTWORK_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type FestivalArtworkType = (typeof FESTIVAL_ARTWORK_TYPES)[number];

/** For a file input's `accept`. */
export const FESTIVAL_ARTWORK_ACCEPT = FESTIVAL_ARTWORK_TYPES.join(",");
