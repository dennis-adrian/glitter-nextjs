import { and, desc, eq, sql } from "drizzle-orm";

import { FESTIVAL_TERMS_DOCUMENT_SLUG } from "@/app/lib/festival-terms/constants";
import type {
  FestivalTermsSection,
  FestivalTermsVersionSummary,
  FestivalTermsVersionWithSections,
} from "@/app/lib/festival-terms/definitions";
import { db } from "@/db";
import {
  festivalTermsDocuments,
  festivalTermsSections,
  festivalTermsVersions,
  users,
} from "@/db/schema";

const versionWithAuthors = {
  publishedBy: {
    columns: { id: true, displayName: true },
  },
  createdBy: {
    columns: { id: true, displayName: true },
  },
  sections: true,
} as const;

function sortSections(sections: FestivalTermsSection[]) {
  return [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function fetchFestivalTermsDocument() {
  return db.query.festivalTermsDocuments.findFirst({
    where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
  });
}

export async function fetchPublishedFestivalTermsVersion(): Promise<FestivalTermsVersionWithSections | null> {
  const document = await fetchFestivalTermsDocument();
  if (!document) return null;

  const version = await db.query.festivalTermsVersions.findFirst({
    where: and(
      eq(festivalTermsVersions.documentId, document.id),
      eq(festivalTermsVersions.status, "published"),
    ),
    orderBy: [desc(festivalTermsVersions.versionNumber)],
    with: versionWithAuthors,
  });

  if (!version) return null;
  return {
    ...version,
    sections: sortSections(version.sections),
  };
}

export async function fetchDraftFestivalTermsVersion(): Promise<FestivalTermsVersionWithSections | null> {
  const document = await fetchFestivalTermsDocument();
  if (!document) return null;

  const version = await db.query.festivalTermsVersions.findFirst({
    where: and(
      eq(festivalTermsVersions.documentId, document.id),
      eq(festivalTermsVersions.status, "draft"),
    ),
    with: versionWithAuthors,
  });

  if (!version) return null;
  return {
    ...version,
    sections: sortSections(version.sections),
  };
}

export async function fetchFestivalTermsVersionById(
  id: number,
): Promise<FestivalTermsVersionWithSections | null> {
  const version = await db.query.festivalTermsVersions.findFirst({
    where: eq(festivalTermsVersions.id, id),
    with: versionWithAuthors,
  });
  if (!version) return null;
  return {
    ...version,
    sections: sortSections(version.sections),
  };
}

export async function listFestivalTermsVersions(): Promise<
  FestivalTermsVersionSummary[]
> {
  const document = await fetchFestivalTermsDocument();
  if (!document) return [];

  const rows = await db
    .select({
      version: festivalTermsVersions,
      publishedByDisplayName: users.displayName,
      sectionCount: sql<number>`count(${festivalTermsSections.id})::int`,
    })
    .from(festivalTermsVersions)
    .leftJoin(users, eq(users.id, festivalTermsVersions.publishedByUserId))
    .leftJoin(
      festivalTermsSections,
      eq(festivalTermsSections.versionId, festivalTermsVersions.id),
    )
    .where(eq(festivalTermsVersions.documentId, document.id))
    .groupBy(festivalTermsVersions.id, users.displayName)
    .orderBy(desc(festivalTermsVersions.versionNumber));

  return rows.map((row) => ({
    ...row.version,
    publishedByDisplayName: row.publishedByDisplayName,
    sectionCount: row.sectionCount,
  }));
}

export async function countStaleActiveFestivalAcceptances(
  publishedVersionId: number,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::text AS count
    FROM user_requests ur
    INNER JOIN festivals f ON f.id = ur.festival_id
    WHERE ur.type = 'festival_participation'
      AND f.status = 'active'
      AND ur.terms_version_id IS DISTINCT FROM ${publishedVersionId}
  `);
  return Number(result.rows[0]?.count ?? 0);
}
