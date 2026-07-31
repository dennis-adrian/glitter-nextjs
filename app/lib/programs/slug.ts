import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { programSessions, programs } from "@/db/schema";

const MAX_SLUG_LENGTH = 120;

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * URL-safe slug from a display name: lowercase, hyphen-separated, accent-free.
 *
 * Deliberately a local copy of the same shape used by `app/lib/products/slug.ts`
 * rather than an import — this domain must not depend on store code, and the
 * logic is eight lines of pure string handling.
 */
export function slugifyTitle(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
}

/** Picks the first unused slug: base, base-2, base-3, … */
export async function ensureUniqueProgramSlug(
  tx: DbOrTx,
  baseSlug: string,
  excludeProgramId?: number,
): Promise<string> {
  const base = slugifyTitle(baseSlug) || "programa";
  let candidate = base;
  let n = 2;

  while (await isProgramSlugTaken(tx, candidate, excludeProgramId)) {
    candidate = `${base}-${n}`;
    n++;
  }

  return candidate;
}

async function isProgramSlugTaken(
  tx: DbOrTx,
  slug: string,
  excludeProgramId?: number,
): Promise<boolean> {
  const where =
    excludeProgramId !== undefined
      ? and(eq(programs.slug, slug), ne(programs.id, excludeProgramId))
      : eq(programs.slug, slug);

  const rows = await tx
    .select({ id: programs.id })
    .from(programs)
    .where(where)
    .limit(1);

  return rows.length > 0;
}

/** Session slugs are unique per program, not globally. */
export async function ensureUniqueSessionSlug(
  tx: DbOrTx,
  programId: number,
  baseSlug: string,
  excludeSessionId?: number,
): Promise<string> {
  const base = slugifyTitle(baseSlug) || "sesion";
  let candidate = base;
  let n = 2;

  while (await isSessionSlugTaken(tx, programId, candidate, excludeSessionId)) {
    candidate = `${base}-${n}`;
    n++;
  }

  return candidate;
}

async function isSessionSlugTaken(
  tx: DbOrTx,
  programId: number,
  slug: string,
  excludeSessionId?: number,
): Promise<boolean> {
  const matches = and(
    eq(programSessions.programId, programId),
    eq(programSessions.slug, slug),
  );
  const where =
    excludeSessionId !== undefined
      ? and(matches, ne(programSessions.id, excludeSessionId))
      : matches;

  const rows = await tx
    .select({ id: programSessions.id })
    .from(programSessions)
    .where(where)
    .limit(1);

  return rows.length > 0;
}
