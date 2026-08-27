"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { EditorTermsSection } from "@/app/lib/festival-terms/definitions";
import {
  fetchDraftFestivalTermsVersion,
  fetchPublishedFestivalTermsVersion,
  listFestivalTermsVersions,
} from "@/app/lib/festival-terms/queries";
import {
  ensureDefaultFestivalTerms,
  insertFestivalTermsSections,
} from "@/app/lib/festival-terms/persist";
import { publishDraftSchema, saveDraftSchema } from "@/app/lib/festival-terms/schema";
import { requireAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivalTermsSections,
  festivalTermsVersions,
} from "@/db/schema";

function revalidateTermsPaths() {
  revalidatePath("/dashboard/terms");
  revalidatePath("/festivals", "layout");
}

export { ensureDefaultFestivalTerms };

export async function getFestivalTermsAdminState() {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  await ensureDefaultFestivalTerms();
  const [published, draft, versions] = await Promise.all([
    fetchPublishedFestivalTermsVersion(),
    fetchDraftFestivalTermsVersion(),
    listFestivalTermsVersions(),
  ]);

  return {
    success: true as const,
    published,
    draft,
    versions,
  };
}

export async function getOrCreateFestivalTermsDraft() {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  await ensureDefaultFestivalTerms();
  const existingDraft = await fetchDraftFestivalTermsVersion();
  if (existingDraft) {
    return { success: true as const, draft: existingDraft };
  }

  const published = await fetchPublishedFestivalTermsVersion();
  if (!published) {
    return {
      success: false as const,
      message: "No hay una versión publicada para editar",
    };
  }

  await db.transaction(async (tx) => {
    const stillDraft = await tx.query.festivalTermsVersions.findFirst({
      where: and(
        eq(festivalTermsVersions.documentId, published.documentId),
        eq(festivalTermsVersions.status, "draft"),
      ),
    });
    if (stillDraft) {
      return stillDraft;
    }

    const [maxRow] = await tx
      .select({
        max: max(festivalTermsVersions.versionNumber),
      })
      .from(festivalTermsVersions)
      .where(eq(festivalTermsVersions.documentId, published.documentId));

    const [created] = await tx
      .insert(festivalTermsVersions)
      .values({
        documentId: published.documentId,
        versionNumber: (maxRow?.max ?? published.versionNumber) + 1,
        status: "draft",
        createdByUserId: profile.id,
      })
      .returning();

    if (!created) {
      throw new Error("No se pudo crear el borrador");
    }

    const source = await tx.query.festivalTermsSections.findMany({
      where: eq(festivalTermsSections.versionId, published.id),
    });
    if (source.length > 0) {
      await tx.insert(festivalTermsSections).values(
        source.map((section) => ({
          versionId: created.id,
          sortOrder: section.sortOrder,
          kind: section.kind,
          layout: section.layout,
          title: section.title,
          bodyJson: section.bodyJson,
          bodyHtml: section.bodyHtml,
          audienceCategories: section.audienceCategories,
          audienceFestivalTypes: section.audienceFestivalTypes,
        })),
      );
    }

    return created;
  });

  revalidateTermsPaths();
  const loaded = await fetchDraftFestivalTermsVersion();
  if (!loaded) {
    return {
      success: false as const,
      message: "No se pudo cargar el borrador",
    };
  }
  return { success: true as const, draft: loaded };
}

async function replaceDraftSections(
  draftId: number,
  documentId: number,
  sections: EditorTermsSection[],
  changelog: string | undefined,
) {
  await db.transaction(async (tx) => {
    const draft = await tx.query.festivalTermsVersions.findFirst({
      where: and(
        eq(festivalTermsVersions.id, draftId),
        eq(festivalTermsVersions.documentId, documentId),
        eq(festivalTermsVersions.status, "draft"),
      ),
    });
    if (!draft) {
      throw new Error("El borrador ya no está disponible");
    }

    await tx
      .delete(festivalTermsSections)
      .where(eq(festivalTermsSections.versionId, draft.id));
    await insertFestivalTermsSections(tx, draft.id, sections);
    await tx
      .update(festivalTermsVersions)
      .set({
        changelog: changelog?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(festivalTermsVersions.id, draft.id));
  });
}

export async function saveFestivalTermsDraft(input: unknown) {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const draft = await fetchDraftFestivalTermsVersion();
  if (!draft) {
    return { success: false as const, message: "No hay un borrador para guardar" };
  }

  try {
    await replaceDraftSections(
      draft.id,
      draft.documentId,
      parsed.data.sections,
      parsed.data.changelog,
    );
  } catch (error) {
    console.error("Error saving festival terms draft", error);
    return { success: false as const, message: "Error al guardar el borrador" };
  }

  revalidateTermsPaths();
  return { success: true as const, message: "Borrador guardado" };
}

export async function publishFestivalTermsDraft(input: unknown) {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = publishDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const draft = await fetchDraftFestivalTermsVersion();
  if (!draft) {
    return {
      success: false as const,
      message: "No hay un borrador para publicar",
    };
  }

  try {
    await db.transaction(async (tx) => {
      const currentDraft = await tx.query.festivalTermsVersions.findFirst({
        where: and(
          eq(festivalTermsVersions.id, draft.id),
          eq(festivalTermsVersions.documentId, draft.documentId),
          eq(festivalTermsVersions.status, "draft"),
        ),
      });
      if (!currentDraft) {
        throw new Error("El borrador ya no está disponible");
      }

      await tx
        .delete(festivalTermsSections)
        .where(eq(festivalTermsSections.versionId, currentDraft.id));
      await insertFestivalTermsSections(
        tx,
        currentDraft.id,
        parsed.data.sections,
      );

      const [published] = await tx
        .update(festivalTermsVersions)
        .set({
          status: "published",
          publishedAt: new Date(),
          publishedByUserId: profile.id,
          changelog: parsed.data.changelog?.trim() || currentDraft.changelog,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(festivalTermsVersions.id, currentDraft.id),
            eq(festivalTermsVersions.status, "draft"),
          ),
        )
        .returning({ id: festivalTermsVersions.id });

      if (!published) {
        throw new Error("El borrador ya no está disponible");
      }
    });
  } catch (error) {
    console.error("Error publishing festival terms", error);
    return {
      success: false as const,
      message: "Error al publicar los términos",
    };
  }

  revalidateTermsPaths();
  return {
    success: true as const,
    message:
      "Versión publicada. Quienes ya aceptaron términos en un festival activo deberán volver a aceptarlos.",
  };
}

export async function discardFestivalTermsDraft() {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const draft = await fetchDraftFestivalTermsVersion();
  if (!draft) {
    return { success: false as const, message: "No hay un borrador" };
  }

  await db
    .delete(festivalTermsVersions)
    .where(
      and(
        eq(festivalTermsVersions.id, draft.id),
        eq(festivalTermsVersions.status, "draft"),
      ),
    );

  revalidateTermsPaths();
  return { success: true as const, message: "Borrador descartado" };
}

export async function getPublishedFestivalTermsForPage() {
  const published = await fetchPublishedFestivalTermsVersion();
  if (published) return published;
  await ensureDefaultFestivalTerms();
  return fetchPublishedFestivalTermsVersion();
}
