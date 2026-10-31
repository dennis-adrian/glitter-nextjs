import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";

import { normalizeAnnouncementDoc } from "@/app/lib/comunicados/content";
import type { ComunicadoDraftSchema } from "@/app/lib/comunicados/definitions";
import { db } from "@/db";
import { comunicados } from "@/db/schema";

/**
 * A comunicado's draft: create, autosave and discard
 * (docs/IMPLEMENTATION-comunicados.md A4, E1, G4). Nothing here sends, and
 * nothing here checks access: the actions do that before calling in.
 */

export type ComunicadoDraft = z.output<typeof ComunicadoDraftSchema>;

export type DraftRefusalCode = "NOT_FOUND" | "NOT_DRAFT" | "STALE";

export const DRAFT_REFUSAL_MESSAGES = {
  NOT_FOUND: "Este borrador ya no existe.",
  NOT_DRAFT: "Este comunicado ya no es un borrador.",
  STALE:
    "Este borrador cambió en otra pestaña. Recargá para ver la última versión.",
} as const satisfies Record<DraftRefusalCode, string>;

type DraftRefusal = { ok: false; code: DraftRefusalCode; message: string };

export type SaveComunicadoDraftResult =
  | {
      ok: true;
      version: number;
      savedAt: Date;
      /** The text was refused and the stored one kept; the rest saved. */
      contentError: string | null;
      /**
       * An earlier request with this `saveKey` was stored, and this one wrote
       * nothing: the stored fields are that request's, not these.
       */
      replayed: boolean;
    }
  | DraftRefusal;

export type DiscardComunicadoDraftResult = { ok: true } | DraftRefusal;

/** An empty draft: every column at its default. */
export async function createComunicadoDraft(actorId: number) {
  const [row] = await db
    .insert(comunicados)
    .values({ createdByUserId: actorId, updatedByUserId: actorId })
    .returning({ id: comunicados.id });
  return row!.id;
}

/**
 * Why a write that matched no row did not apply, from the row read once
 * afterwards: it is gone, it left the draft state, or another tab saved first.
 */
function refusalFor(row: { status: string } | undefined): DraftRefusal {
  const code: DraftRefusalCode = !row
    ? "NOT_FOUND"
    : row.status !== "draft"
      ? "NOT_DRAFT"
      : "STALE";
  return { ok: false, code, message: DRAFT_REFUSAL_MESSAGES[code] };
}

async function draftRefusal(comunicadoId: number): Promise<DraftRefusal> {
  const [row] = await db
    .select({ status: comunicados.status })
    .from(comunicados)
    .where(eq(comunicados.id, comunicadoId))
    .limit(1);
  return refusalFor(row);
}

/** Postgres refuses NUL in text, so one pasted into a field would fail every save. */
function withoutNul<T extends string | null>(value: T): T {
  return (value === null ? null : value.replace(/\u0000/g, "")) as T;
}

/**
 * The autosave (G4): the working copy, compare-and-set on `version` (E1), so
 * a tab that saw an older version cannot overwrite a newer one, and a
 * scheduled or sent comunicado is never touched. Half-written fields save:
 * the content CHECKs skip drafts (A4), and the send rules are checked when it
 * is test-sent, scheduled or sent. A text `normalizeAnnouncementDoc` refuses,
 * or one left out of the request, keeps the stored one while every other
 * field saves, so a bad paste never loses the title or the audience.
 *
 * The save also stores its `saveKey`. A request whose version is one behind
 * and whose key is the stored one follows a save with that key that committed
 * but whose answer was lost: it is answered `replayed`, with the version that
 * save wrote, instead of reading as another tab's change. It writes nothing,
 * so the stored fields are the earlier request's, whatever this one carries.
 */
export async function saveComunicadoDraft(
  draft: ComunicadoDraft,
  actorId: number,
): Promise<SaveComunicadoDraftResult> {
  const content =
    draft.doc === undefined
      ? null
      : normalizeAnnouncementDoc(draft.doc, { stage: "draft" });
  const contentError = content && !content.ok ? content.message : null;

  const [row] = await db
    .update(comunicados)
    .set({
      autosaveKey: draft.saveKey,
      title: withoutNul(draft.title),
      ...(content?.ok ? { doc: content.blocks } : {}),
      actionLabel: withoutNul(draft.actionLabel),
      actionPath: withoutNul(draft.actionPath),
      sendEmail: draft.sendEmail,
      sendPush: draft.sendPush,
      audience: draft.audience,
      essential: draft.essential,
      essentialReason: withoutNul(draft.essentialReason),
      version: sql`${comunicados.version} + 1`,
      updatedByUserId: actorId,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(comunicados.id, draft.comunicadoId),
        eq(comunicados.status, "draft"),
        eq(comunicados.version, draft.expectedVersion),
      ),
    )
    .returning({
      version: comunicados.version,
      savedAt: comunicados.updatedAt,
    });

  if (row) {
    return {
      ok: true,
      version: row.version,
      savedAt: row.savedAt,
      contentError,
      replayed: false,
    };
  }

  const [stored] = await db
    .select({
      status: comunicados.status,
      version: comunicados.version,
      autosaveKey: comunicados.autosaveKey,
      savedAt: comunicados.updatedAt,
    })
    .from(comunicados)
    .where(eq(comunicados.id, draft.comunicadoId))
    .limit(1);
  // An earlier request with this key wrote the version after the expected
  // one. Any later write bumped the version, and another tab's save also
  // replaced the key.
  if (
    stored?.status === "draft" &&
    stored.autosaveKey === draft.saveKey &&
    stored.version === draft.expectedVersion + 1
  ) {
    return {
      ok: true,
      version: stored.version,
      savedAt: stored.savedAt,
      contentError,
      replayed: true,
    };
  }
  return refusalFor(stored);
}

/**
 * "Descartar borrador": deletes a draft and nothing else. A scheduled one has
 * to be cancelled first, and a sent one is also held by its revisions'
 * RESTRICT foreign key.
 */
export async function discardComunicadoDraft(
  comunicadoId: number,
): Promise<DiscardComunicadoDraftResult> {
  const deleted = await db
    .delete(comunicados)
    .where(
      and(eq(comunicados.id, comunicadoId), eq(comunicados.status, "draft")),
    )
    .returning({ id: comunicados.id });
  if (deleted.length > 0) return { ok: true };
  // A row that reads as a draft now came back from a schedule meanwhile.
  return draftRefusal(comunicadoId);
}
