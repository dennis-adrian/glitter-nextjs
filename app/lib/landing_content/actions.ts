"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  requireAdmin,
  requireAdminOrFestivalAdmin,
} from "@/app/lib/users/helpers";
import { db } from "@/db";
import { landingPageDrafts, landingPagePublications } from "@/db/schema";
import { LANDING_PAGE_KEY } from "./definitions";
import { isEligiblePublishedFestival } from "./resolve";
import { parseLandingPageContent } from "./schema";

type SaveInput = { content: unknown; expectedVersion: number };
function actionError(message: string) {
  return { ok: false as const, message };
}

async function validateForPublish(content: unknown) {
  const parsed = parseLandingPageContent(content);
  if (!parsed.success) return null;
  const event = parsed.data.sections.eventSpotlight;
  if (
    event.source === "selected" &&
    event.festivalId &&
    !(await isEligiblePublishedFestival(event.festivalId))
  )
    return null;
  return parsed.data;
}

export async function saveLandingPageDraft(input: SaveInput) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return actionError("No autorizado");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0)
    return actionError("Versión inválida");
  const parsed = parseLandingPageContent(input.content);
  if (!parsed.success)
    return actionError("El contenido no cumple el formato requerido");
  const now = new Date();
  if (input.expectedVersion === 0) {
    const inserted = await db
      .insert(landingPageDrafts)
      .values({
        pageKey: LANDING_PAGE_KEY,
        content: parsed.data,
        version: 1,
        updatedByUserId: actor.id,
        updatedAt: now,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({
        version: landingPageDrafts.version,
        updatedAt: landingPageDrafts.updatedAt,
      });
    if (!inserted[0])
      return {
        ok: false as const,
        conflict: true as const,
        message: "El borrador cambió. Recargá antes de guardar.",
      };
    revalidatePath("/dashboard/landing", "page");
    return {
      ok: true as const,
      version: inserted[0].version,
      updatedAt: inserted[0].updatedAt,
    };
  }
  const updated = await db
    .update(landingPageDrafts)
    .set({
      content: parsed.data,
      version: input.expectedVersion + 1,
      updatedByUserId: actor.id,
      updatedAt: now,
    })
    .where(
      and(
        eq(landingPageDrafts.pageKey, LANDING_PAGE_KEY),
        eq(landingPageDrafts.version, input.expectedVersion),
      ),
    )
    .returning({
      version: landingPageDrafts.version,
      updatedAt: landingPageDrafts.updatedAt,
    });
  if (!updated[0])
    return {
      ok: false as const,
      conflict: true as const,
      message: "El borrador cambió. Recargá antes de guardar.",
    };
  revalidatePath("/dashboard/landing", "page");
  return {
    ok: true as const,
    version: updated[0].version,
    updatedAt: updated[0].updatedAt,
  };
}

export async function publishLandingPageDraft({
  expectedVersion,
}: {
  expectedVersion: number;
}) {
  const actor = await requireAdmin();
  if (!actor) return actionError("Solo un administrador puede publicar");
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
    return actionError("Guardá el borrador antes de publicar");
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select 1 from landing_page_drafts where page_key = ${LANDING_PAGE_KEY} for update`,
    );
    const draft = await tx.query.landingPageDrafts.findFirst({
      where: eq(landingPageDrafts.pageKey, LANDING_PAGE_KEY),
    });
    if (!draft || draft.version !== expectedVersion) return null;
    const content = await validateForPublish(draft.content);
    if (!content) return "invalid" as const;
    const [publication] = await tx
      .insert(landingPagePublications)
      .values({
        pageKey: LANDING_PAGE_KEY,
        content,
        sourceDraftVersion: draft.version,
        publishedByUserId: actor.id,
        publishedAt: new Date(),
      })
      .returning({
        id: landingPagePublications.id,
        publishedAt: landingPagePublications.publishedAt,
      });
    return publication;
  });
  if (result === "invalid")
    return actionError(
      "El borrador no es publicable; revisá el festival seleccionado y los campos.",
    );
  if (!result)
    return {
      ok: false as const,
      conflict: true as const,
      message: "El borrador cambió. Recargá antes de publicar.",
    };
  revalidatePath("/", "page");
  revalidatePath("/dashboard/landing", "page");
  return {
    ok: true as const,
    publicationId: result.id,
    publishedAt: result.publishedAt,
  };
}

export async function restoreLandingPublicationToDraft({
  publicationId,
  expectedDraftVersion,
}: {
  publicationId: number;
  expectedDraftVersion: number;
}) {
  const actor = await requireAdmin();
  if (!actor)
    return actionError("Solo un administrador puede restaurar publicaciones");
  if (
    !Number.isInteger(publicationId) ||
    !Number.isInteger(expectedDraftVersion)
  )
    return actionError("Versión inválida");
  const publication = await db.query.landingPagePublications.findFirst({
    where: and(
      eq(landingPagePublications.id, publicationId),
      eq(landingPagePublications.pageKey, LANDING_PAGE_KEY),
    ),
  });
  if (!publication || !parseLandingPageContent(publication.content).success)
    return actionError("Publicación no encontrada");
  return saveLandingPageDraft({
    content: publication.content,
    expectedVersion: expectedDraftVersion,
  });
}
