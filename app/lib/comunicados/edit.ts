import "server-only";

import { eq, sql } from "drizzle-orm";

import type { EditRefusalCode } from "@/app/lib/comunicados/contracts";
import {
  type ComunicadosTx,
  lockComunicadoExclusive,
} from "@/app/lib/comunicados/locks";
import { excerptOf } from "@/app/lib/comunicados/text";
import {
  type ComunicadoSendCheck,
  validateComunicadoForSend,
} from "@/app/lib/comunicados/validate";
import { hasPgErrorCode } from "@/app/lib/errors/postgres";
import { safeActionPath } from "@/app/lib/notifications/definitions";
import {
  buildInAppCopy,
  parseNotificationData,
} from "@/app/lib/notifications/registry";
import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";
import { db } from "@/db";
import { comunicadoRevisions, comunicados } from "@/db/schema";

/**
 * Editing a sent comunicado (docs/IMPLEMENTATION-comunicados.md F1, F2, F4,
 * V1, V2): a new revision with the title, the text and the button, and every
 * inbox item already written rewritten to it. One transaction under the
 * comunicado's exclusive lock, so it waits for the fan-out chunk or email
 * batch in flight, and every later one reads the new revision. Emails need
 * nothing: a batch renders whatever revision is current when it takes the
 * lock. Nothing here checks access: the action does.
 */

export type EditComunicadoOutcome =
  | {
      ok: true;
      revision: number;
      campaignId: number;
      /** Inbox items it rewrote. */
      updatedItems: number;
    }
  | { ok: false; code: EditRefusalCode; message: string };

const EDIT_MESSAGES = {
  NOT_FOUND: "No encontramos este comunicado.",
  NOT_SENT: "Este comunicado no se envió.",
  RETRACTED: "Este comunicado fue retirado.",
  STALE: "Alguien más lo editó recién. Recargá para ver la última versión.",
  NOTE_REQUIRED:
    "Contá por qué cambia un correo esencial (lo ve solo el equipo).",
  NO_CHANGES: "No cambiaste nada: el comunicado sigue igual.",
  LOCKED:
    "Se están enviando correos de este comunicado en este momento. Probá de nuevo en unos segundos.",
  BUSY: "No pudimos guardar los cambios. Probá de nuevo.",
} as const satisfies Record<
  Exclude<EditRefusalCode, "INVALID_CONTENT">,
  string
>;

function refusal(
  code: Exclude<EditRefusalCode, "INVALID_CONTENT">,
): EditComunicadoOutcome {
  return { ok: false, code, message: EDIT_MESSAGES[code] };
}

/** The new revision as every surface writes it, rendered once. */
type EditContent = Extract<ComunicadoSendCheck, { ok: true }> & {
  html: string;
  excerpt: string;
  note: string | null;
};

/**
 * F1's steps, in this order. The batch in flight holds the shared lock across
 * its Resend request, so the wait is at most about 15 s; 20 s of
 * `lock_timeout` covers it.
 */
async function editInTransaction(
  tx: ComunicadosTx,
  comunicadoId: number,
  expectedRevision: number,
  content: EditContent,
  by: number,
): Promise<EditComunicadoOutcome> {
  await tx.execute(sql`SET LOCAL lock_timeout = '20s'`);
  await lockComunicadoExclusive(tx, comunicadoId);

  const { rows } = await tx.execute<{
    status: string;
    campaign_id: number | null;
    current_revision: number | null;
    retracted: boolean;
  }>(sql`
    SELECT status, campaign_id, current_revision,
      retracted_at IS NOT NULL AS retracted
    FROM comunicados WHERE id = ${comunicadoId}::int
    FOR UPDATE
  `);
  const row = rows[0];
  if (!row) return refusal("NOT_FOUND");
  if (
    row.status !== "sent" ||
    row.campaign_id == null ||
    row.current_revision == null
  ) {
    return refusal("NOT_SENT");
  }
  if (row.retracted) return refusal("RETRACTED");
  const current = Number(row.current_revision);
  if (current !== expectedRevision) return refusal("STALE");
  const campaignId = Number(row.campaign_id);

  // What every surface shows is the revision's title, HTML, text and
  // button: the same again would only mark everyone's item "Editado" (§J's
  // notes). The text counts too: the email and its text part are drawn from
  // the blocks and indent a nested one, which the inbox HTML lays flat.
  const { rows: previous } = await tx.execute<{
    title: string;
    html: string;
    text: string;
    action_label: string | null;
    action_path: string | null;
  }>(sql`
    SELECT title, html, text, action_label, action_path
    FROM comunicado_revisions
    WHERE comunicado_id = ${comunicadoId}::int AND revision = ${current}::int
  `);
  const before = previous[0];
  if (!before) throw new Error("comunicado_revision_missing");
  if (
    before.title === content.title &&
    before.html === content.html &&
    before.text === content.text &&
    before.action_label === content.actionLabel &&
    before.action_path === content.actionPath
  ) {
    return refusal("NO_CHANGES");
  }

  // `created_at` is the clock's, after the wait for the lock.
  const revision = current + 1;
  await tx.insert(comunicadoRevisions).values({
    comunicadoId,
    revision,
    title: content.title,
    doc: content.blocks,
    html: content.html,
    text: content.text,
    actionLabel: content.actionLabel,
    actionPath: content.actionPath,
    editNote: content.note,
    createdByUserId: by,
  });

  // Only the title of the working copy: its text and button stay as they
  // were sent, and "Duplicar" reads the revision (F1 step 4).
  await tx.execute(sql`
    UPDATE comunicados
    SET current_revision = ${revision}::int, title = ${content.title}::text,
      version = version + 1, updated_at = now(),
      updated_by_user_id = ${by}::int
    WHERE id = ${comunicadoId}::int
  `);
  await tx.execute(sql`
    UPDATE notification_campaigns
    SET title = ${content.title}::text, message = ${content.text}::text,
      updated_at = now()
    WHERE id = ${campaignId}::int
  `);

  // Every item a chunk committed before the lock (F1 step 5), written as
  // `notifyMany` writes a new one from the kind's data; `read_at` stays (K7).
  // "Editado" is the revision's own time, so the inbox, the page and the
  // history agree (§J's notes). Chunks after this write the new revision
  // without it.
  const data = parseNotificationData("comunicado", {
    comunicadoId,
    revision,
    title: content.title,
    excerpt: content.excerpt,
    actionPath: content.actionPath,
    actionLabel: content.actionLabel,
  });
  if (!data) throw new Error("notification_data_invalid:comunicado");
  const copy = buildInAppCopy("comunicado", data);
  const { rows: items } = await tx.execute<{ id: number }>(sql`
    UPDATE notifications
    SET title = ${copy.title}::text, body = ${copy.body}::text,
      action_path = ${safeActionPath(copy.actionPath)}::text,
      action_label = ${copy.actionLabel}::text,
      edited_at = (
        SELECT created_at FROM comunicado_revisions
        WHERE comunicado_id = ${comunicadoId}::int
          AND revision = ${revision}::int
      ),
      data = data || jsonb_build_object(
        'revision', ${data.revision}::int, 'title', ${data.title}::text,
        'excerpt', ${data.excerpt}::text,
        'actionPath', ${data.actionPath}::text,
        'actionLabel', ${data.actionLabel}::text)
    WHERE campaign_id = ${campaignId}::int AND kind = 'comunicado'
      AND retracted_at IS NULL
    RETURNING id
  `);

  return { ok: true, revision, campaignId, updatedItems: items.length };
}

/**
 * "Guardar cambios" (F1): a sent comunicado that is not retracted, at the
 * revision the page was opened on. Only the title, the text and the button
 * change; an essential one needs a note for the team. The content is checked
 * and rendered as at send, before any lock is taken. A deadlock retries once
 * (F4); a second one, or a batch holding the lock past the timeout, answers
 * "probá de nuevo". Logs ids and counts only (I4).
 */
export async function editSentComunicado(
  id: number,
  i: {
    expectedRevision: number;
    title: string;
    doc: unknown;
    actionLabel: string | null;
    actionPath: string | null;
    editNote?: string | null;
  },
  by: number,
): Promise<EditComunicadoOutcome> {
  const [row] = await db
    .select({
      status: comunicados.status,
      essential: comunicados.essential,
      essentialReason: comunicados.essentialReason,
      sendEmail: comunicados.sendEmail,
      retractedAt: comunicados.retractedAt,
    })
    .from(comunicados)
    .where(eq(comunicados.id, id))
    .limit(1);
  if (!row) return refusal("NOT_FOUND");
  if (row.status !== "sent") return refusal("NOT_SENT");
  // Before the note: a retracted one takes no edit, note or not. The lock
  // checks again, for a retraction that commits in between.
  if (row.retractedAt) return refusal("RETRACTED");

  const note = i.editNote?.trim() || null;
  if (row.essential && !note) return refusal("NOTE_REQUIRED");

  // The essential mark, its reason and the channels are the send's: only
  // what this edit changes is new.
  const checked = await validateComunicadoForSend({
    title: i.title,
    doc: i.doc,
    actionLabel: i.actionLabel,
    actionPath: i.actionPath,
    essential: row.essential,
    essentialReason: row.essentialReason,
    sendEmail: row.sendEmail,
  });
  if (!checked.ok) {
    return { ok: false, code: "INVALID_CONTENT", message: checked.message };
  }
  const content: EditContent = {
    ...checked,
    html: await blocksToSanitizedHtml(checked.blocks, "announcement"),
    excerpt: excerptOf(checked.text),
    note,
  };

  const attempt = () =>
    db.transaction((tx) =>
      editInTransaction(tx, id, i.expectedRevision, content, by),
    );

  let outcome: EditComunicadoOutcome;
  try {
    try {
      outcome = await attempt();
    } catch (error) {
      if (!hasPgErrorCode(error, "40P01")) throw error;
      outcome = await attempt();
    }
  } catch (error) {
    if (hasPgErrorCode(error, "55P03")) return refusal("LOCKED");
    if (hasPgErrorCode(error, "40P01")) return refusal("BUSY");
    throw error;
  }

  if (outcome.ok) {
    console.log("[comunicados] edit", {
      comunicadoId: id,
      revision: outcome.revision,
      items: outcome.updatedItems,
    });
  }
  return outcome;
}
