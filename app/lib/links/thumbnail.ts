import "server-only";

import { UTFile } from "uploadthing/server";

import { isAllowedRemoteImageHost } from "@/app/lib/images/remote-hosts";
import {
  fetchPublicImage,
  findLinkImage,
  type PublicImage,
} from "@/app/lib/links/link-image";
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
 * has none, or either cannot be read.
 *
 * This server fetches both the page and the image, each through
 * `link-image.ts`, which refuses any address that is not a public web
 * server. The image is handed to UploadThing as a file: never as an address
 * for `uploadFilesFromUrl`, which would have this server fetch it again with
 * no such check.
 */
export async function importLinkImage(href: string): Promise<string | null> {
  let image: PublicImage;
  try {
    const address = await findLinkImage(href);
    if (!address) return null;
    image = await fetchPublicImage(address);
  } catch (error) {
    console.warn("link image: not read", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }

  const uploaded = await utapi.uploadFiles(
    new UTFile([new Uint8Array(image.body)], `link.${image.extension}`, {
      type: image.type,
    }),
  );
  if (uploaded.error || !uploaded.data) {
    console.warn("link image: copy failed", {
      code: uploaded.error?.code ?? "unknown",
    });
    return null;
  }
  const url = uploaded.data.ufsUrl ?? uploaded.data.url;
  if (!url || !isStoredImageUrl(url)) return null;
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
