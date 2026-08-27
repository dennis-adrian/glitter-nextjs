import { and, eq, isNull } from "drizzle-orm";

import { FESTIVAL_TERMS_DOCUMENT_SLUG } from "@/app/lib/festival-terms/constants";
import type { EditorTermsSection } from "@/app/lib/festival-terms/definitions";
import { blocksToSeedHtml } from "@/app/lib/festival-terms/html";
import {
  fetchFestivalTermsDocument,
  fetchPublishedFestivalTermsVersion,
} from "@/app/lib/festival-terms/queries";
import { buildInitialFestivalTermsSections } from "@/app/lib/festival-terms/seed-content";
import { sanitizeRichTextHtml } from "@/app/lib/rich-text/sanitize";
import { db } from "@/db";
import {
  festivalTermsDocuments,
  festivalTermsSections,
  festivalTermsVersions,
  userRequests,
} from "@/db/schema";

export async function renderTermsSectionHtml(
  kind: EditorTermsSection["kind"],
  bodyJson: unknown,
): Promise<string | null> {
  if (kind === "schedule") return null;
  if (!Array.isArray(bodyJson) || bodyJson.length === 0) return "";
  try {
    const { blocksToSanitizedHtml } = await import("@/app/lib/rich-text/render");
    return await blocksToSanitizedHtml(bodyJson, "article");
  } catch {
    return sanitizeRichTextHtml(blocksToSeedHtml(bodyJson), "article");
  }
}

export async function insertFestivalTermsSections(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  versionId: number,
  sections: EditorTermsSection[],
) {
  if (sections.length === 0) return;

  const rows = await Promise.all(
    sections.map(async (section, index) => ({
      versionId,
      sortOrder: index,
      kind: section.kind,
      layout: section.layout,
      title: section.title.trim() || null,
      bodyJson: section.kind === "schedule" ? null : (section.bodyJson ?? null),
      bodyHtml: await renderTermsSectionHtml(section.kind, section.bodyJson),
      audienceCategories: section.audienceCategories,
      audienceFestivalTypes: section.audienceFestivalTypes,
    })),
  );

  await tx.insert(festivalTermsSections).values(rows);
}

export function seedSectionsToEditor(): EditorTermsSection[] {
  return buildInitialFestivalTermsSections().map((section, index) => ({
    clientId: `seed-${index}`,
    kind: section.kind,
    layout: section.layout,
    title: section.title ?? "",
    bodyJson: section.bodyJson,
    audienceCategories: section.audienceCategories,
    audienceFestivalTypes: section.audienceFestivalTypes,
  }));
}

export async function ensureDefaultFestivalTerms() {
  const existing = await fetchFestivalTermsDocument();
  if (existing) {
    const published = await fetchPublishedFestivalTermsVersion();
    if (published) return published;
  }

  return db.transaction(async (tx) => {
    const current = await tx.query.festivalTermsDocuments.findFirst({
      where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
    });
    if (current) {
      const published = await tx.query.festivalTermsVersions.findFirst({
        where: and(
          eq(festivalTermsVersions.documentId, current.id),
          eq(festivalTermsVersions.status, "published"),
        ),
      });
      if (published) return published;
    }

    const [document] =
      current != null
        ? [current]
        : await tx
            .insert(festivalTermsDocuments)
            .values({ slug: FESTIVAL_TERMS_DOCUMENT_SLUG })
            .returning();

    if (!document) {
      throw new Error("No se pudo crear el documento de términos");
    }

    const [version] = await tx
      .insert(festivalTermsVersions)
      .values({
        documentId: document.id,
        versionNumber: 1,
        status: "published",
        changelog: "Versión inicial migrada desde el contenido en código",
        publishedAt: new Date(),
      })
      .returning();

    if (!version) {
      throw new Error("No se pudo crear la versión inicial de términos");
    }

    await insertFestivalTermsSections(tx, version.id, seedSectionsToEditor());

    await tx
      .update(userRequests)
      .set({ termsVersionId: version.id, updatedAt: new Date() })
      .where(
        and(
          eq(userRequests.type, "festival_participation"),
          isNull(userRequests.termsVersionId),
        ),
      );

    return version;
  });
}
