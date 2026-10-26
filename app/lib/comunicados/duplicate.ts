import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

/**
 * "Duplicar" (docs/IMPLEMENTATION-comunicados.md G6): a new draft with what
 * the comunicado says now and whom it was for. A sent one is copied from its
 * current revision, since an edit leaves the working copy behind (F1); any
 * other from its working copy. The title is kept as it is. Never the push,
 * the essential mark, its reason or the schedule: each is a decision to take
 * again for the copy. Nothing here checks access: the action does.
 */

/** The new draft's id, or null when the source does not exist. */
export async function duplicateComunicado(
  sourceId: number,
  by: number,
): Promise<number | null> {
  const { rows } = await db.execute<{ id: number }>(sql`
    INSERT INTO comunicados
      (title, doc, action_label, action_path, send_email, send_push,
       audience, essential, created_by_user_id, updated_by_user_id)
    SELECT coalesce(rv.title, k.title), coalesce(rv.doc, k.doc),
      CASE WHEN rv.revision IS NULL THEN k.action_label ELSE rv.action_label END,
      CASE WHEN rv.revision IS NULL THEN k.action_path ELSE rv.action_path END,
      k.send_email, false, k.audience, false, ${by}::int, ${by}::int
    FROM comunicados k
    LEFT JOIN comunicado_revisions rv
      ON rv.comunicado_id = k.id AND rv.revision = k.current_revision
    WHERE k.id = ${sourceId}::int
    RETURNING id
  `);
  const id = rows[0]?.id;
  return id == null ? null : Number(id);
}
