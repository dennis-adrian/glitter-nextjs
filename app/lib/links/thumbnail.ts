import "server-only";

import { isAllowedRemoteImageHost } from "@/app/lib/images/remote-hosts";
import { findLinkImage } from "@/app/lib/links/link-image";
import { deleteStoredFile } from "@/app/lib/uploadthing/storage";
import { utapi } from "@/app/server/uploadthing";

/*
 * A link's thumbnail image. It is always a file of ours on UploadThing: one
 * the admin uploaded, or a copy of the image the link's page offers for
 * itself. The page never shows an image from someone else's server, which
 * could change it, take it down or count our visitors.
 */

/** Whether `url` is a file on UploadThing, the only images a link may show. */
export function isStoredImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      /^\/f\/[^/]+$/.test(parsed.pathname) &&
      // Clerk and EdgeStore are remote image hosts too, but never ours here.
      (parsed.hostname === "utfs.io" ||
        (parsed.hostname.endsWith("ufs.sh") &&
          isAllowedRemoteImageHost(parsed.hostname)))
    );
  } catch {
    return false;
  }
}

/**
 * Copies the image the page at `href` offers for itself (its OpenGraph
 * image) to UploadThing, and answers the copy's address. Null when the page
 * has none or cannot be read. UploadThing fetches the image, not this
 * server; this server reads only the page, through `fetchPublicPage`.
 */
export async function importLinkImage(href: string): Promise<string | null> {
  let image: string | null;
  try {
    image = await findLinkImage(href);
  } catch (error) {
    console.warn("link image: page not read", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
  if (!image) return null;

  const uploaded = await utapi.uploadFilesFromUrl(image);
  if (uploaded.error || !uploaded.data) {
    console.warn("link image: copy failed", {
      code: uploaded.error?.code ?? "unknown",
    });
    return null;
  }
  const url = uploaded.data.ufsUrl ?? uploaded.data.url;
  if (!url || !isStoredImageUrl(url)) return null;
  // What the page calls its image is not always one.
  if (uploaded.data.type && !uploaded.data.type.startsWith("image/")) {
    await deleteStoredFile(url, uploaded.data.key);
    return null;
  }
  return url;
}

/** Deletes a thumbnail no link shows any more. Never throws. */
export async function removeLinkImage(url: string | null | undefined) {
  if (!url || !isStoredImageUrl(url)) return;
  const result = await deleteStoredFile(url);
  if (!result.success) {
    console.warn("link image: stored file not deleted");
  }
}
