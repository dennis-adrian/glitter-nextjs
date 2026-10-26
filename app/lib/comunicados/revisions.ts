import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { requireAdmin } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";
import { comunicadoRevisions, users } from "@/db/schema";

/**
 * A sent comunicado's versions (docs/IMPLEMENTATION-comunicados.md A5, F2,
 * G6, G7): the report's "Historial", what "Ver" opens, and what the edit
 * page starts from. Revision 1 is what was sent; each edit adds the next.
 * Global admins only: every query checks inside, and answers anyone else
 * with null.
 */

export type ComunicadoRevisionSummary = {
  revision: number;
  title: string;
  editNote: string | null;
  createdAt: Date;
  createdByName: string | null;
};

export type ComunicadoRevision = ComunicadoRevisionSummary & {
  /** The normalized document. */
  doc: unknown[];
  /** Rendered and sanitized when it was written. */
  html: string;
  /** Plain text without URLs. */
  text: string;
  actionLabel: string | null;
  actionPath: string | null;
};

async function canRead() {
  return (await requireAdmin()) !== null;
}

function personName(
  row: {
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null,
) {
  if (!row) return null;
  return getUserName(row) || null;
}

// The person's id first: drizzle reads a left-joined object as missing when
// its first column is null, so someone without a display name would lose
// their first and last names with it.
const createdBy = {
  id: users.id,
  displayName: users.displayName,
  firstName: users.firstName,
  lastName: users.lastName,
};

/** Every version, the first one first. An empty list for an unknown id. */
export async function fetchComunicadoRevisions(
  comunicadoId: number,
): Promise<ComunicadoRevisionSummary[] | null> {
  if (!(await canRead())) return null;
  const rows = await db
    .select({
      revision: comunicadoRevisions.revision,
      title: comunicadoRevisions.title,
      editNote: comunicadoRevisions.editNote,
      createdAt: comunicadoRevisions.createdAt,
      createdBy,
    })
    .from(comunicadoRevisions)
    .leftJoin(users, eq(users.id, comunicadoRevisions.createdByUserId))
    .where(eq(comunicadoRevisions.comunicadoId, comunicadoId))
    .orderBy(asc(comunicadoRevisions.revision));
  return rows.map(({ createdBy: by, ...row }) => ({
    ...row,
    createdByName: personName(by),
  }));
}

/** One version as it was written, or null when there is no such version. */
export async function fetchComunicadoRevision(
  comunicadoId: number,
  revision: number,
): Promise<ComunicadoRevision | null> {
  if (!(await canRead())) return null;
  const [row] = await db
    .select({
      revision: comunicadoRevisions.revision,
      title: comunicadoRevisions.title,
      doc: comunicadoRevisions.doc,
      html: comunicadoRevisions.html,
      text: comunicadoRevisions.text,
      actionLabel: comunicadoRevisions.actionLabel,
      actionPath: comunicadoRevisions.actionPath,
      editNote: comunicadoRevisions.editNote,
      createdAt: comunicadoRevisions.createdAt,
      createdBy,
    })
    .from(comunicadoRevisions)
    .leftJoin(users, eq(users.id, comunicadoRevisions.createdByUserId))
    .where(
      and(
        eq(comunicadoRevisions.comunicadoId, comunicadoId),
        eq(comunicadoRevisions.revision, revision),
      ),
    )
    .limit(1);
  if (!row) return null;
  const { createdBy: by, ...found } = row;
  return { ...found, createdByName: personName(by) };
}
