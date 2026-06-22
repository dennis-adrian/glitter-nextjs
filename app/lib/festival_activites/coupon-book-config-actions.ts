import {
  COUPON_BOOK_DRAFT_SCHEMA_VERSION,
  CouponBookDraft,
  isCouponBookDraft,
  normalizeCouponBookDraftPayload,
} from "@/app/lib/festival_activites/coupon-book-draft";
import { resolveCouponBookHeaderImageUrl } from "@/app/lib/festival_activites/coupon-book-header-image";
import { db } from "@/db";
import { festivalActivityCouponBookConfigs } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const MAX_DRAFT_BYTES = 2 * 1024 * 1024;

export { MAX_DRAFT_BYTES };

function sanitizeImageUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return resolveCouponBookHeaderImageUrl(value) ?? null;
}

export function sanitizeCouponBookDraft(draft: CouponBookDraft): CouponBookDraft {
  const entries = Object.fromEntries(
    Object.entries(draft.entries).map(([id, entry]) => [
      id,
      {
        ...entry,
        imageUrl: sanitizeImageUrl(entry.imageUrl),
      },
    ]),
  );
  const books = draft.books.map((book) => ({
    ...book,
    headerImageUrl: sanitizeImageUrl(book.headerImageUrl),
  }));
  return {
    ...draft,
    entries,
    books,
  };
}

export async function fetchSavedCouponBookConfig(activityId: number): Promise<{
  draft: CouponBookDraft | null;
  revision: number | null;
  updatedAt: Date | null;
}> {
  const row = await db.query.festivalActivityCouponBookConfigs.findFirst({
    where: eq(festivalActivityCouponBookConfigs.activityId, activityId),
  });
  if (!row) {
    return { draft: null, revision: null, updatedAt: null };
  }
  const payload = row.payload as unknown;
  const draft =
    normalizeCouponBookDraftPayload(payload) ??
    (isCouponBookDraft(payload) ? payload : null);
  if (!draft) {
    return { draft: null, revision: row.revision, updatedAt: row.updatedAt };
  }
  return {
    draft: sanitizeCouponBookDraft({
      ...draft,
      savedRevision: row.revision,
    }),
    revision: row.revision,
    updatedAt: row.updatedAt,
  };
}

export async function saveCouponBookConfig(input: {
  activityId: number;
  draft: CouponBookDraft;
  userId: number;
  validParticipationIds: Set<number>;
  expectedRevision?: number | null;
}): Promise<
  | { ok: true; revision: number }
  | { ok: false; error: string; status?: number; currentRevision?: number }
> {
  const serialized = JSON.stringify(input.draft);
  if (serialized.length > MAX_DRAFT_BYTES) {
    return { ok: false, error: "La configuración de cuponera es demasiado grande." };
  }

  if (input.draft.schemaVersion !== COUPON_BOOK_DRAFT_SCHEMA_VERSION) {
    return { ok: false, error: "Versión de borrador no soportada." };
  }

  for (const entry of Object.values(input.draft.entries)) {
    if (entry.type !== "participant" || entry.participationId === null) continue;
    if (!input.validParticipationIds.has(entry.participationId)) {
      return {
        ok: false,
        error: `Participación inválida en el borrador: ${entry.participationId}`,
      };
    }
  }

  const sanitized = sanitizeCouponBookDraft({
    ...input.draft,
    updatedAt: new Date().toISOString(),
  });

  const existing = await db.query.festivalActivityCouponBookConfigs.findFirst({
    where: eq(festivalActivityCouponBookConfigs.activityId, input.activityId),
  });

  if (existing) {
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== null &&
      existing.revision !== input.expectedRevision
    ) {
      return {
        ok: false,
        error:
          "La configuración fue modificada por otro usuario. Recarga la página e intenta de nuevo.",
        status: 409,
        currentRevision: existing.revision,
      };
    }

    const nextRevision = existing.revision + 1;
    const updated = await db
      .update(festivalActivityCouponBookConfigs)
      .set({
        payload: sanitized,
        revision: nextRevision,
        updatedByUserId: input.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(festivalActivityCouponBookConfigs.id, existing.id),
          eq(festivalActivityCouponBookConfigs.revision, existing.revision),
        ),
      )
      .returning({ revision: festivalActivityCouponBookConfigs.revision });

    if (updated.length === 0) {
      const current = await db.query.festivalActivityCouponBookConfigs.findFirst(
        {
          where: eq(
            festivalActivityCouponBookConfigs.activityId,
            input.activityId,
          ),
        },
      );
      return {
        ok: false,
        error:
          "La configuración fue modificada por otro usuario. Recarga la página e intenta de nuevo.",
        status: 409,
        currentRevision: current?.revision ?? existing.revision,
      };
    }

    return { ok: true, revision: nextRevision };
  }

  const [inserted] = await db
    .insert(festivalActivityCouponBookConfigs)
    .values({
      activityId: input.activityId,
      payload: sanitized,
      revision: 1,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
    })
    .returning({ revision: festivalActivityCouponBookConfigs.revision });

  return { ok: true, revision: inserted.revision };
}
