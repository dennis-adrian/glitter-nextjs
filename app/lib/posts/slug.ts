import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { postCategories, postTags, posts } from "@/db/schema";

export { slugifyName } from "@/app/lib/products/slug";

const MAX_SLUG_LENGTH = 120;

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const UNIQUE_VIOLATION = "23505";

function isSlugConflict(error: unknown): boolean {
  const candidate = error as { code?: unknown; constraint?: unknown } | null;
  return (
    candidate?.code === UNIQUE_VIOLATION &&
    typeof candidate.constraint === "string" &&
    candidate.constraint.includes("slug")
  );
}

/**
 * Re-runs a slug-writing transaction when it loses a race for the slug it
 * picked.
 *
 * The `ensureUnique*` helpers below ask the database what is free; they cannot
 * reserve it, because a SELECT takes no lock. Two drafts created in the same
 * instant both resolve `borrador` — every new draft starts from that same base
 * — and one hits the unique index. The constraint is what protects the data;
 * this only decides whether the loser gets an error or the next free suffix.
 *
 * Retrying the whole transaction is what makes it correct: the body re-derives
 * the slug against the row the winner just committed. The transaction rolled
 * back, so there is nothing to undo, and these bodies touch only the database.
 */
export async function retryingSlugConflict<T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isSlugConflict(error)) throw error;
    }
  }
}

/**
 * `base-2`, `base-3`, … kept inside `MAX_SLUG_LENGTH`.
 *
 * Trimming the base to the limit and *then* appending the suffix pushed a
 * maximum-length slug over it, past what `postFormSchema` accepts. The room
 * for the suffix has to come out of the base.
 */
function suffixed(base: string, n: number): string {
  const suffix = `-${n}`;
  return `${base.slice(0, MAX_SLUG_LENGTH - suffix.length)}${suffix}`;
}

export async function ensureUniquePostSlug(
  tx: DbOrTx,
  baseSlug: string,
  excludePostId?: number,
): Promise<string> {
  const base = baseSlug.trim().slice(0, MAX_SLUG_LENGTH) || "articulo";
  let candidate = base;
  let n = 2;

  while (await isPostSlugTaken(tx, candidate, excludePostId)) {
    candidate = suffixed(base, n);
    n++;
  }
  return candidate;
}

async function isPostSlugTaken(
  tx: DbOrTx,
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const where =
    excludeId !== undefined
      ? and(eq(posts.slug, slug), ne(posts.id, excludeId))
      : eq(posts.slug, slug);
  const rows = await tx
    .select({ id: posts.id })
    .from(posts)
    .where(where)
    .limit(1);
  return rows.length > 0;
}

export async function ensureUniquePostCategorySlug(
  tx: DbOrTx,
  baseSlug: string,
  excludeId?: number,
): Promise<string> {
  const base = baseSlug.trim().slice(0, MAX_SLUG_LENGTH) || "categoria";
  let candidate = base;
  let n = 2;

  while (await isCategorySlugTaken(tx, candidate, excludeId)) {
    candidate = suffixed(base, n);
    n++;
  }
  return candidate;
}

async function isCategorySlugTaken(
  tx: DbOrTx,
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const where =
    excludeId !== undefined
      ? and(eq(postCategories.slug, slug), ne(postCategories.id, excludeId))
      : eq(postCategories.slug, slug);
  const rows = await tx
    .select({ id: postCategories.id })
    .from(postCategories)
    .where(where)
    .limit(1);
  return rows.length > 0;
}

/*
 * There is deliberately no `ensureUniquePostTagSlug`. A tag is identified by
 * its slug, so a colliding slug *is* the same tag — `syncPostTags` gets-or-
 * creates with `ON CONFLICT (slug) DO NOTHING`, which is both race-free and
 * the correct semantics. Suffixing would have invented a second "stands".
 */
