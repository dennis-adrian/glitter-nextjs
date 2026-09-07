import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { postCategories, postTags, posts } from "@/db/schema";

export { slugifyName } from "@/app/lib/products/slug";

const MAX_SLUG_LENGTH = 120;

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export async function ensureUniquePostTagSlug(
  tx: DbOrTx,
  baseSlug: string,
  excludeId?: number,
): Promise<string> {
  const base = baseSlug.trim().slice(0, MAX_SLUG_LENGTH) || "etiqueta";
  let candidate = base;
  let n = 2;

  while (await isTagSlugTaken(tx, candidate, excludeId)) {
    candidate = suffixed(base, n);
    n++;
  }
  return candidate;
}

async function isTagSlugTaken(
  tx: DbOrTx,
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const where =
    excludeId !== undefined
      ? and(eq(postTags.slug, slug), ne(postTags.id, excludeId))
      : eq(postTags.slug, slug);
  const rows = await tx
    .select({ id: postTags.id })
    .from(postTags)
    .where(where)
    .limit(1);
  return rows.length > 0;
}
