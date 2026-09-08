import type { BaseProfile } from "@/app/api/users/definitions";
import type { PostAudience } from "@/app/lib/posts/definitions";
import { isStaff } from "@/app/lib/posts/helpers";

/**
 * The viewer an audience decision is made about. `null` is a signed-out
 * visitor, which is the common case on the public blog — callers pass the
 * resolved profile straight through without a guard.
 */
export type PostViewer = Pick<BaseProfile, "id" | "role" | "status"> | null;

/**
 * Whether this viewer may read a post's body.
 *
 * Deliberately pure and deliberately the only answer to this question: every
 * read path — list, detail, category, tag, search, metadata, comments — routes
 * through here, so there is one rule to reason about and one place a mistake
 * could live.
 *
 * `verified` is the whole participant test. `paused` and `banned` are separate
 * statuses rather than flags on top of `verified`, so someone who has been
 * paused stops passing this check until they are reinstated, which is the
 * intent.
 */
export function canReadPost(
  viewer: PostViewer,
  post: { audience: PostAudience },
): boolean {
  if (post.audience === "public") return true;
  if (!viewer) return false;
  if (isStaff(viewer.role)) return true;
  return viewer.status === "verified";
}

/**
 * Whether a viewer should be shown the gate instead of the body.
 *
 * The card, the title, the excerpt and the cover stay visible either way —
 * gated posts are listed, not hidden (PRD §7.8). This only governs the body.
 */
export function isPostGatedFor(
  viewer: PostViewer,
  post: { audience: PostAudience },
): boolean {
  return !canReadPost(viewer, post);
}

/**
 * Strips a gated post's body before it can reach a response.
 *
 * Serializing `contentHtml` into a page the viewer may not read would leak it
 * whether or not the component renders it — a server component's props travel
 * to the client in the flight payload. Clearing it here, at the boundary, is
 * what makes "listed but gated" safe rather than merely visually hidden.
 */
export function withGateApplied<
  T extends { audience: PostAudience; contentHtml: string },
>(viewer: PostViewer, post: T): T & { gated: boolean } {
  const gated = isPostGatedFor(viewer, post);
  return { ...post, contentHtml: gated ? "" : post.contentHtml, gated };
}
