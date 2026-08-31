import { and, eq, isNull, sql } from "drizzle-orm";

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

type FestivalTermsTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Must match `FESTIVAL_TERMS_LOCK_NAMESPACE` in `app/lib/reservations/locks.ts`
 * so confirmation and terms publication cannot race.
 */
const FESTIVAL_TERMS_INIT_LOCK_NAMESPACE = 5822;

async function lockFestivalTermsDocument(tx: FestivalTermsTx) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${FESTIVAL_TERMS_INIT_LOCK_NAMESPACE}, hashtext(${FESTIVAL_TERMS_DOCUMENT_SLUG}))`,
  );
}

async function findFestivalTermsDocument(tx: FestivalTermsTx) {
  return tx.query.festivalTermsDocuments.findFirst({
    where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
  });
}

async function findVersionByStatus(
  tx: FestivalTermsTx,
  documentId: number,
  status: "draft" | "published",
) {
  return tx.query.festivalTermsVersions.findFirst({
    where: and(
      eq(festivalTermsVersions.documentId, documentId),
      eq(festivalTermsVersions.status, status),
    ),
  });
}

async function versionsAfterConflict(tx: FestivalTermsTx) {
  const document = await findFestivalTermsDocument(tx);
  if (!document) {
    return { document: null, published: null, draft: null };
  }
  const published = await findVersionByStatus(tx, document.id, "published");
  const draft = await findVersionByStatus(tx, document.id, "draft");
  return { document, published, draft };
}

async function getOrCreateFestivalTermsDocument(tx: FestivalTermsTx) {
  const existing = await findFestivalTermsDocument(tx);
  if (existing) return existing;

  const [created] = await tx
    .insert(festivalTermsDocuments)
    .values({ slug: FESTIVAL_TERMS_DOCUMENT_SLUG })
    .onConflictDoNothing({ target: festivalTermsDocuments.slug })
    .returning();
  if (created) return created;

  const document = await findFestivalTermsDocument(tx);
  if (!document) {
    throw new Error("No se pudo crear el documento de términos");
  }
  return document;
}

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
  tx: FestivalTermsTx,
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

export async function createInitialFestivalTermsDraft(createdByUserId: number) {
  return db.transaction(async (tx) => {
    await lockFestivalTermsDocument(tx);
    const document = await getOrCreateFestivalTermsDocument(tx);

    const existingDraft = await findVersionByStatus(tx, document.id, "draft");
    if (existingDraft) {
      return existingDraft;
    }

    const existingPublished = await findVersionByStatus(
      tx,
      document.id,
      "published",
    );
    if (existingPublished) {
      throw new Error(
        "Ya hay una versión publicada; usá el flujo de clonado para editar",
      );
    }

    const [version] = await tx
      .insert(festivalTermsVersions)
      .values({
        documentId: document.id,
        versionNumber: 1,
        status: "draft",
        createdByUserId,
        changelog: "Borrador inicial desde contenido base",
      })
      .onConflictDoNothing()
      .returning();

    if (!version) {
      const { published, draft } = await versionsAfterConflict(tx);
      if (published) {
        throw new Error(
          "Ya hay una versión publicada; usá el flujo de clonado para editar",
        );
      }
      if (draft) return draft;
      throw new Error("No se pudo crear el borrador inicial de términos");
    }

    await insertFestivalTermsSections(tx, version.id, seedSectionsToEditor());
    return version;
  });
}

export async function ensureDefaultFestivalTerms() {
  const existing = await fetchFestivalTermsDocument();
  if (existing) {
    const published = await fetchPublishedFestivalTermsVersion();
    if (published) return published;
  }

  return db.transaction(async (tx) => {
    await lockFestivalTermsDocument(tx);

    const document = await getOrCreateFestivalTermsDocument(tx);
    const published = await findVersionByStatus(tx, document.id, "published");
    if (published) return published;

    const [version] = await tx
      .insert(festivalTermsVersions)
      .values({
        documentId: document.id,
        versionNumber: 1,
        status: "published",
        changelog: "Versión inicial migrada desde el contenido en código",
        publishedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (!version) {
      const existingVersions = await versionsAfterConflict(tx);
      if (existingVersions.published) return existingVersions.published;
      if (existingVersions.draft) return existingVersions.draft;
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
