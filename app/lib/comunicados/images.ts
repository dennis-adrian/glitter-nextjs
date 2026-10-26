import { COMUNICADO_MAX_IMAGES } from "@/app/lib/comunicados/definitions";
import { isUploadThingFileUrl } from "@/app/lib/uploadthing/file-key";

/**
 * A comunicado's images (docs/IMPLEMENTATION-comunicados.md C2.5, C4).
 * Pure and client-safe: the composer counts and flags images with the same
 * functions the server refuses them with. The client must not import
 * `./content`, which pulls in the sanitizer.
 */

export const COMUNICADO_IMAGE_CAP_MESSAGE = `Un comunicado puede tener hasta ${COMUNICADO_MAX_IMAGES} imágenes.`;

type ImageNode = {
  type?: unknown;
  props?: { url?: unknown } | null;
  children?: unknown;
};

/** The control characters `normalizeAnnouncementDoc` strips from text. */
const STRIPPED_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/**
 * The address of every image block at any depth, in document order, as
 * the server stores it: without the control characters it strips, and
 * trimmed. An image with no address yet (an upload under way, or one that
 * never finished) is not an image: it shows nothing and is dropped on save.
 */
function imageUrls(blocks: unknown): string[] {
  const urls: string[] = [];
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const block = node as ImageNode;
      const raw = block.props?.url;
      const url =
        typeof raw === "string"
          ? raw.replace(STRIPPED_CONTROL_CHARACTERS, "").trim()
          : "";
      if (block.type === "image" && url) urls.push(url);
      walk(block.children);
    }
  };
  walk(blocks);
  return urls;
}

/** Image blocks with an address, at any depth (`COMUNICADO_MAX_IMAGES`). */
export function countComunicadoImages(blocks: unknown): number {
  return imageUrls(blocks).length;
}

/**
 * Addresses of images not uploaded to Glitter, one per image: a paste from
 * another page brings its images along. A draft keeps them; sending refuses
 * them (`COMUNICADO_FOREIGN_IMAGE_MESSAGE`).
 */
export function foreignComunicadoImageUrls(blocks: unknown): string[] {
  return imageUrls(blocks).filter((url) => !isUploadThingFileUrl(url));
}
