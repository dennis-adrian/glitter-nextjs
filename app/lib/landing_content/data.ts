import "server-only";

import { cache } from "react";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { landingPageDrafts, landingPagePublications } from "@/db/schema";
import { DEFAULT_LANDING_PAGE_CONTENT } from "./default-content";
import { LANDING_PAGE_KEY, type LandingPageContentV1 } from "./definitions";
import { parseLandingPageContent } from "./schema";

const LATEST_PUBLICATION_SCAN_LIMIT = 10;

function validContent(value: unknown): LandingPageContentV1 | null {
  const parsed = parseLandingPageContent(value);
  return parsed.success ? parsed.data : null;
}

export const getLatestLandingPublication = cache(async () => {
  let rows: (typeof landingPagePublications.$inferSelect)[];
  try {
    rows = await db
      .select()
      .from(landingPagePublications)
      .where(eq(landingPagePublications.pageKey, LANDING_PAGE_KEY))
      .orderBy(desc(landingPagePublications.id))
      .limit(LATEST_PUBLICATION_SCAN_LIMIT);
  } catch (error) {
    console.error("Unable to read landing publications", error);
    return null;
  }
  for (const row of rows) {
    const content = validContent(row.content);
    if (content) return { ...row, content };
    console.error("Invalid landing publication", { publicationId: row.id });
  }
  return null;
});

export const getPublishedLandingContent = cache(
  async (): Promise<LandingPageContentV1> =>
    (await getLatestLandingPublication())?.content ??
    DEFAULT_LANDING_PAGE_CONTENT,
);

export async function getLandingDraft() {
  let row: typeof landingPageDrafts.$inferSelect | undefined;
  try {
    row = await db.query.landingPageDrafts.findFirst({
      where: eq(landingPageDrafts.pageKey, LANDING_PAGE_KEY),
    });
  } catch (error) {
    console.error("Unable to read landing draft", error);
    return null;
  }
  if (!row) return null;
  const content = validContent(row.content);
  if (!content) {
    console.error("Invalid landing draft", { pageKey: LANDING_PAGE_KEY });
    return null;
  }
  return { ...row, content };
}

export async function getLandingDraftOrFallback() {
  const draft = await getLandingDraft();
  if (draft) return draft;
  const publication = await getLatestLandingPublication();
  return {
    pageKey: LANDING_PAGE_KEY,
    content: publication?.content ?? DEFAULT_LANDING_PAGE_CONTENT,
    version: 0,
    updatedByUserId: null,
    updatedAt: publication?.publishedAt ?? null,
    createdAt: publication?.publishedAt ?? null,
  };
}

export async function getLandingPublicationMetadata() {
  const publication = await getLatestLandingPublication();
  return publication
    ? {
        id: publication.id,
        publishedAt: publication.publishedAt,
        sourceDraftVersion: publication.sourceDraftVersion,
      }
    : null;
}

export async function getLandingPublicationHistory(limit = 20) {
  const rows = await db
    .select({
      id: landingPagePublications.id,
      sourceDraftVersion: landingPagePublications.sourceDraftVersion,
      publishedAt: landingPagePublications.publishedAt,
      publishedByUserId: landingPagePublications.publishedByUserId,
    })
    .from(landingPagePublications)
    .where(eq(landingPagePublications.pageKey, LANDING_PAGE_KEY))
    .orderBy(desc(landingPagePublications.id))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows;
}
