/**
 * Formats a festival poster may be uploaded in. The poster leads the visitor
 * invitation email, which embeds the uploaded file as-is: Outlook for Windows
 * cannot show WebP and Gmail cannot show SVG, so only JPEG and PNG are safe
 * everywhere the poster goes. The site would show anything, through
 * next/image; the inbox is the constraint.
 *
 * Shared by the upload field and the UploadThing route, so the picker and the
 * server refuse the same files.
 */
export const FESTIVAL_ARTWORK_TYPES = ["image/jpeg", "image/png"] as const;

export type FestivalArtworkType = (typeof FESTIVAL_ARTWORK_TYPES)[number];

/** For a file input's `accept`. */
export const FESTIVAL_ARTWORK_ACCEPT = FESTIVAL_ARTWORK_TYPES.join(",");
