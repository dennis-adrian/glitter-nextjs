/**
 * Read helpers for the blog. Server-only, never a server action.
 *
 * This file used to open with `"use server"`, which turns every export into an
 * endpoint the client can invoke by action id. Several of these return
 * editorial data with no authorization of their own —
 * `fetchAllPostsForAdmin` hands back every draft, `fetchPostByIdForEditor` any
 * post by id, `fetchSubmittedPostsForReview` the queue, each with reviewer
 * notes and working copies attached — so the directive published them.
 *
 * `server-only` is the correct marker: it keeps the module out of client
 * bundles without exposing anything. Authorization stays where it belongs, in
 * the pages and actions that call these.
 */
import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { canEditPost } from "@/app/lib/posts/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  postCategories,
  postCategoriesToPosts,
  postTags,
  postTagsToPosts,
  posts,
} from "@/db/schema";
import {
  type PostCategoryRow,
  type PostStatus,
  type PostTagRow,
  type PostWithRelations,
  type PublicPostListItem,
} from "./definitions";

const PAGE_SIZE = 12;

/**
 * `role` is here so `postBylineName` can tell a staff-written article from a
 * participant's without a second query. These are server components, so the
 * value is used to render a string and never reaches the browser.
 */
const PUBLIC_AUTHOR_COLUMNS = {
  id: true as const,
  displayName: true as const,
  firstName: true as const,
  lastName: true as const,
  imageUrl: true as const,
  role: true as const,
};

type ListFilters = {
  page?: number;
  perPage?: number;
  categorySlug?: string;
  tagSlug?: string;
  q?: string;
};

function offsetFor(page: number | undefined, perPage: number) {
  const p = Math.max(1, Math.floor(page ?? 1));
  return (p - 1) * perPage;
}

async function resolveCategoryIdBySlug(slug: string): Promise<number | null> {
  const [row] = await db
    .select({ id: postCategories.id })
    .from(postCategories)
    .where(eq(postCategories.slug, slug))
    .limit(1);
  return row?.id ?? null;
}

async function resolveTagIdBySlug(slug: string): Promise<number | null> {
  const [row] = await db
    .select({ id: postTags.id })
    .from(postTags)
    .where(eq(postTags.slug, slug))
    .limit(1);
  return row?.id ?? null;
}

async function postIdsForCategory(slug: string): Promise<number[]> {
  const id = await resolveCategoryIdBySlug(slug);
  if (id === null) return [];
  const rows = await db
    .select({ postId: postCategoriesToPosts.postId })
    .from(postCategoriesToPosts)
    .where(eq(postCategoriesToPosts.categoryId, id));
  return rows.map((r) => r.postId);
}

async function postIdsForTag(slug: string): Promise<number[]> {
  const id = await resolveTagIdBySlug(slug);
  if (id === null) return [];
  const rows = await db
    .select({ postId: postTagsToPosts.postId })
    .from(postTagsToPosts)
    .where(eq(postTagsToPosts.tagId, id));
  return rows.map((r) => r.postId);
}

/**
 * The `where` for a public listing, or `null` when a filter matched nothing
 * and the caller should short-circuit to an empty page.
 *
 * Audience is deliberately absent: a restricted post is still *listed*
 * (PRD §7.8), so the filters here are the same for every viewer and only the
 * body is gated. Keeping this in one place is what stops the list and its
 * count from drifting apart and paginating over different sets.
 */
async function buildPublicConditions(filters: ListFilters) {
  const conditions = [eq(posts.status, "published" as PostStatus)];

  if (filters.categorySlug) {
    const ids = await postIdsForCategory(filters.categorySlug);
    if (ids.length === 0) return null;
    conditions.push(inArray(posts.id, ids));
  }
  if (filters.tagSlug) {
    const ids = await postIdsForTag(filters.tagSlug);
    if (ids.length === 0) return null;
    conditions.push(inArray(posts.id, ids));
  }
  if (filters.q && filters.q.trim()) {
    const needle = `%${filters.q.trim()}%`;
    const search = or(ilike(posts.title, needle), ilike(posts.excerpt, needle));
    if (search) conditions.push(search);
  }

  return conditions;
}

export async function fetchPublishedPosts(
  filters: ListFilters = {},
): Promise<PublicPostListItem[]> {
  try {
    const perPage = Math.min(100, Math.max(1, filters.perPage ?? PAGE_SIZE));
    const offset = offsetFor(filters.page, perPage);

    const conditions = await buildPublicConditions(filters);
    if (conditions === null) return [];

    const rows = await db.query.posts.findMany({
      where: and(...conditions),
      with: {
        author: { columns: PUBLIC_AUTHOR_COLUMNS },
        postCategories: { with: { category: true } },
        postTags: { with: { tag: true } },
      },
      orderBy: [desc(posts.publishedAt), desc(posts.id)],
      limit: perPage,
      offset,
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      coverImageUrl: r.coverImageUrl,
      publishedAt: r.publishedAt,
      audience: r.audience,
      author: r.author,
      categories: r.postCategories.map((pc) => pc.category),
      tags: r.postTags.map((pt) => pt.tag),
    }));
  } catch (error) {
    console.error("fetchPublishedPosts", error);
    return [];
  }
}

export async function countPublishedPosts(
  filters: Omit<ListFilters, "page" | "perPage"> = {},
): Promise<number> {
  try {
    const conditions = await buildPublicConditions(filters);
    if (conditions === null) return 0;

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(and(...conditions));
    return row?.count ?? 0;
  } catch (error) {
    console.error("countPublishedPosts", error);
    return 0;
  }
}

export async function fetchPostBySlug(
  slug: string,
): Promise<PostWithRelations | null> {
  const row = await db.query.posts.findFirst({
    where: and(
      eq(posts.slug, slug),
      eq(posts.status, "published" as PostStatus),
    ),
    with: {
      author: { columns: PUBLIC_AUTHOR_COLUMNS },
      reviewer: { columns: PUBLIC_AUTHOR_COLUMNS },
      postCategories: { with: { category: true } },
      postTags: { with: { tag: true } },
    },
  });
  if (!row) return null;
  return {
    ...row,
    categories: row.postCategories.map((pc) => pc.category),
    tags: row.postTags.map((pt) => pt.tag),
  };
}

export async function fetchPostBySlugForWorkingPreview(
  slug: string,
): Promise<PostWithRelations | null> {
  // Self-gated: a working preview leaks unpublished title/excerpt/cover etc.
  // to anyone who hits /blog/<slug>?preview=working. The caller used to be
  // trusted to enforce auth, but generateMetadata bypassed that. Authorize
  // inside the function using the same `canEditPost` predicate the editor
  // uses, against the session profile loaded server-side.
  const profile = await getCurrentUserProfile();
  if (!profile) return null;

  const row = await db.query.posts.findFirst({
    where: eq(posts.slug, slug),
    with: {
      author: { columns: PUBLIC_AUTHOR_COLUMNS },
      reviewer: { columns: PUBLIC_AUTHOR_COLUMNS },
      postCategories: { with: { category: true } },
      postTags: { with: { tag: true } },
    },
  });
  if (!row) return null;
  if (row.workingUpdatedAt === null) return null;
  if (!canEditPost(profile, row)) return null;
  return {
    ...row,
    categories: row.postCategories.map((pc) => pc.category),
    tags: row.postTags.map((pt) => pt.tag),
  };
}

export async function fetchPostByIdForEditor(
  id: number,
): Promise<PostWithRelations | null> {
  const row = await db.query.posts.findFirst({
    where: eq(posts.id, id),
    with: {
      author: { columns: PUBLIC_AUTHOR_COLUMNS },
      reviewer: { columns: PUBLIC_AUTHOR_COLUMNS },
      postCategories: { with: { category: true } },
      postTags: { with: { tag: true } },
    },
  });
  if (!row) return null;
  return {
    ...row,
    categories: row.postCategories.map((pc) => pc.category),
    tags: row.postTags.map((pt) => pt.tag),
  };
}

export async function fetchAuthoredPostsForUser(
  userId: number,
): Promise<PostWithRelations[]> {
  try {
    const rows = await db.query.posts.findMany({
      where: eq(posts.authorId, userId),
      with: {
        author: { columns: PUBLIC_AUTHOR_COLUMNS },
        reviewer: { columns: PUBLIC_AUTHOR_COLUMNS },
        postCategories: { with: { category: true } },
        postTags: { with: { tag: true } },
      },
      orderBy: [desc(posts.updatedAt)],
    });
    return rows.map((r) => ({
      ...r,
      categories: r.postCategories.map((pc) => pc.category),
      tags: r.postTags.map((pt) => pt.tag),
    }));
  } catch (error) {
    console.error("fetchAuthoredPostsForUser", error);
    return [];
  }
}

export async function fetchAllPostsForAdmin(opts: {
  status?: PostStatus;
  q?: string;
}): Promise<PostWithRelations[]> {
  try {
    const conditions = [];
    if (opts.status) conditions.push(eq(posts.status, opts.status));
    if (opts.q && opts.q.trim()) {
      conditions.push(ilike(posts.title, `%${opts.q.trim()}%`));
    }

    const rows = await db.query.posts.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: {
        author: { columns: PUBLIC_AUTHOR_COLUMNS },
        reviewer: { columns: PUBLIC_AUTHOR_COLUMNS },
        postCategories: { with: { category: true } },
        postTags: { with: { tag: true } },
      },
      orderBy: [desc(posts.updatedAt)],
    });
    return rows.map((r) => ({
      ...r,
      categories: r.postCategories.map((pc) => pc.category),
      tags: r.postTags.map((pt) => pt.tag),
    }));
  } catch (error) {
    console.error("fetchAllPostsForAdmin", error);
    return [];
  }
}

export async function fetchSubmittedPostsForReview(): Promise<
  PostWithRelations[]
> {
  try {
    const rows = await db.query.posts.findMany({
      /**
       * Two things await a decision, not one. A `submitted` draft is the
       * obvious case; the other is a post that is already live with an edit
       * staged and sent for review — `workingSubmittedAt` set and no reviewer
       * notes yet. Matching only on status left those invisible, so an author
       * could submit changes to a published article and no admin would ever
       * be shown them.
       */
      where: or(
        eq(posts.status, "submitted" as PostStatus),
        and(
          isNotNull(posts.workingSubmittedAt),
          isNull(posts.workingReviewerNotes),
        ),
      ),
      with: {
        author: { columns: PUBLIC_AUTHOR_COLUMNS },
        reviewer: { columns: PUBLIC_AUTHOR_COLUMNS },
        postCategories: { with: { category: true } },
        postTags: { with: { tag: true } },
      },
      orderBy: [asc(posts.updatedAt)],
    });
    return rows.map((r) => ({
      ...r,
      categories: r.postCategories.map((pc) => pc.category),
      tags: r.postTags.map((pt) => pt.tag),
    }));
  } catch (error) {
    console.error("fetchSubmittedPostsForReview", error);
    return [];
  }
}

export async function fetchPostCategories(): Promise<PostCategoryRow[]> {
  return await db
    .select()
    .from(postCategories)
    .orderBy(asc(postCategories.name));
}

export async function fetchPostCategoryBySlug(
  slug: string,
): Promise<PostCategoryRow | null> {
  try {
    const [row] = await db
      .select()
      .from(postCategories)
      .where(eq(postCategories.slug, slug))
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.error("fetchPostCategoryBySlug", error);
    return null;
  }
}

export async function fetchPostTagBySlug(
  slug: string,
): Promise<PostTagRow | null> {
  try {
    const [row] = await db
      .select()
      .from(postTags)
      .where(eq(postTags.slug, slug))
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.error("fetchPostTagBySlug", error);
    return null;
  }
}
