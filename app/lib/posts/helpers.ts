import type { BaseProfile } from "@/app/api/users/definitions";
import type { PostRow, PostStatus } from "@/app/lib/posts/definitions";

export function isStaff(role: string | null | undefined): boolean {
  return role === "admin" || role === "festival_admin";
}

export function canPublishPosts(role: string | null | undefined): boolean {
  return isStaff(role);
}

const WORKING_COPY_STATUSES: PostStatus[] = [
  "submitted",
  "approved",
  "scheduled",
  "published",
  "rejected",
];

const AUTHOR_EDITABLE_STATUSES: PostStatus[] = [
  "draft",
  ...WORKING_COPY_STATUSES,
];

export function canEditPost(
  profile: Pick<BaseProfile, "id" | "role">,
  post: Pick<PostRow, "authorId" | "status">,
): boolean {
  if (post.status === "archived") return false;
  if (isStaff(profile.role)) return true;
  return (
    post.authorId === profile.id &&
    AUTHOR_EDITABLE_STATUSES.includes(post.status)
  );
}

export function usesWorkingCopy(post: Pick<PostRow, "status">): boolean {
  return WORKING_COPY_STATUSES.includes(post.status);
}

export function hasWorking(post: Pick<PostRow, "workingUpdatedAt">): boolean {
  return post.workingUpdatedAt !== null;
}

export function workingPendingReview(
  post: Pick<PostRow, "workingSubmittedAt" | "workingReviewerNotes">,
): boolean {
  return post.workingSubmittedAt !== null && post.workingReviewerNotes === null;
}

export function workingRejected(
  post: Pick<PostRow, "workingReviewerNotes">,
): boolean {
  return post.workingReviewerNotes !== null;
}

export function canDeletePost(
  profile: Pick<BaseProfile, "id" | "role">,
  post: Pick<PostRow, "authorId" | "publishedAt">,
): boolean {
  if (post.publishedAt !== null) return false;
  return isStaff(profile.role) || post.authorId === profile.id;
}

export function canArchivePost(
  profile: Pick<BaseProfile, "id" | "role">,
  post: Pick<PostRow, "authorId" | "status">,
): boolean {
  if (post.status !== "published") return false;
  return isStaff(profile.role) || post.authorId === profile.id;
}

/**
 * Blocks that are content in their own right, with nothing to say about text.
 * An article that is one table, or one diagram, is a real article.
 */
const STANDALONE_BLOCK_TYPES = new Set(["image", "table"]);

/**
 * Whether a document has anything a reader would see.
 *
 * Walks nested children as well as top-level blocks: the earlier version read
 * only each top-level block's own inline array, so text inside a nested block
 * — and every table, whose `content` is a `{ type, rows }` object rather than
 * an array — counted as empty and could not be published.
 */
export function hasMeaningfulContent(content: unknown): boolean {
  if (!Array.isArray(content) || content.length === 0) return false;

  for (const raw of content) {
    const block = raw as {
      type?: unknown;
      content?: unknown;
      children?: unknown;
    };

    if (
      typeof block.type === "string" &&
      STANDALONE_BLOCK_TYPES.has(block.type)
    ) {
      return true;
    }

    if (Array.isArray(block.content)) {
      for (const node of block.content) {
        const text = (node as { text?: unknown }).text;
        if (typeof text === "string" && text.trim().length > 0) return true;
        // Links carry their text one level down.
        const nested = (node as { content?: unknown }).content;
        if (
          Array.isArray(nested) &&
          hasMeaningfulContent([{ content: nested }])
        ) {
          return true;
        }
      }
    }

    if (Array.isArray(block.children) && hasMeaningfulContent(block.children)) {
      return true;
    }
  }

  return false;
}

/**
 * Display name for a post's byline.
 *
 * Falls back to the house name both when the author row is gone — deleting an
 * account nulls `authorId` and leaves the article standing — and when the
 * profile simply carries no name.
 */
export function postAuthorName(
  author:
    | Pick<BaseProfile, "displayName" | "firstName" | "lastName">
    | null
    | undefined,
): string {
  if (!author) return "Equipo Glitter";
  return (
    (author.displayName ??
      [author.firstName, author.lastName].filter(Boolean).join(" ")) ||
    "Equipo Glitter"
  );
}

/**
 * The name a *reader* sees on an article.
 *
 * Staff write as the organisation, not as themselves: an announcement signed
 * "Admin Glitter" reads like a person's opinion when it is the festival
 * speaking. A participant keeps their own name — the byline is the credit they
 * are writing for.
 *
 * Deliberately separate from `postAuthorName`, which stays the plain name and
 * is what the review queue and comment threads use. A reviewer needs to know
 * which human submitted a draft, and an admin commenting in a thread is taking
 * part in a conversation rather than publishing.
 */
export function postBylineName(
  author:
    | (Pick<BaseProfile, "displayName" | "firstName" | "lastName"> & {
        role?: string | null;
      })
    | null
    | undefined,
): string {
  if (author && isStaff(author.role)) return "Equipo Glitter";
  return postAuthorName(author);
}
