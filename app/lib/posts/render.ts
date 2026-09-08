import "server-only";

import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";

/**
 * Renders a post's stored BlockNote document to the HTML the public page
 * serves.
 *
 * The HTML is derived here, from the blocks, and never accepted from the
 * client. That is the whole point: `content` is what the editor and the
 * reviewer see, so if the published HTML came over the wire as its own
 * field the two could disagree — an author could submit innocuous blocks
 * for review and publish something else. Deriving one from the other makes
 * that divergence unrepresentable.
 */
export async function renderPostHtml(content: unknown): Promise<string> {
  return await blocksToSanitizedHtml(content, "blog");
}
