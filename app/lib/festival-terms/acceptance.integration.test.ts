// @vitest-environment node

import { and, desc, eq, max, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  hasAcceptedCurrentFestivalTerms,
  needsFestivalTermsReacceptance,
  nextEnrollmentTermsWrite,
} from "@/app/lib/festival-terms/acceptance";
import { filterSectionsForAudience } from "@/app/lib/festival-terms/audience";
import { FESTIVAL_TERMS_DOCUMENT_SLUG } from "@/app/lib/festival-terms/constants";
import * as schema from "@/db/schema";
import {
  festivalTermsDocuments,
  festivalTermsVersions,
  festivals,
  userRequests,
  users,
} from "@/db/schema";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
    return /(^|[_-])(test|ci)([_-]|$)/i.test(databaseName);
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Fixture = {
  userId: number;
  festivalAId: number;
  festivalBId: number;
  requestId: number;
  extraVersionIds: number[];
  /** Document whose published row must be scoped during cleanup restore. */
  restoreDocumentId?: number;
  /** Seed published version temporarily archived for the test; restore after cleanup. */
  restorePublishedVersionId?: number;
};

const fixtures: Fixture[] = [];

describeDatabase("festival terms schema and acceptance", () => {
  beforeAll(async () => {
    const db = integrationDb!;
    const document = await db.query.festivalTermsDocuments.findFirst({
      where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
    });
    if (!document) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  });

  afterEach(async () => {
    const db = integrationDb!;
    const leftover = fixtures.splice(0);
    for (const fixture of leftover) {
      if (
        fixture.restorePublishedVersionId != null &&
        fixture.restoreDocumentId != null
      ) {
        await db
          .update(festivalTermsVersions)
          .set({ status: "archived", updatedAt: new Date() })
          .where(
            and(
              eq(festivalTermsVersions.status, "published"),
              eq(festivalTermsVersions.documentId, fixture.restoreDocumentId),
            ),
          );
        await db
          .update(festivalTermsVersions)
          .set({ status: "published", updatedAt: new Date() })
          .where(
            eq(festivalTermsVersions.id, fixture.restorePublishedVersionId),
          );
      }
      for (const versionId of fixture.extraVersionIds) {
        await db
          .delete(festivalTermsVersions)
          .where(eq(festivalTermsVersions.id, versionId));
      }
      if (fixture.requestId > 0) {
        await db
          .delete(userRequests)
          .where(eq(userRequests.id, fixture.requestId));
      }
      if (fixture.festivalAId > 0) {
        await db.delete(festivals).where(eq(festivals.id, fixture.festivalAId));
      }
      if (fixture.festivalBId > 0) {
        await db.delete(festivals).where(eq(festivals.id, fixture.festivalBId));
      }
      if (fixture.userId > 0) {
        await db.delete(users).where(eq(users.id, fixture.userId));
      }
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("seeds one published document with audience-tagged sections and a schedule slot", async () => {
    const db = integrationDb!;
    const document = await db.query.festivalTermsDocuments.findFirst({
      where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
    });
    expect(document).toBeTruthy();

    const published = await db.query.festivalTermsVersions.findFirst({
      where: and(
        eq(festivalTermsVersions.documentId, document!.id),
        eq(festivalTermsVersions.status, "published"),
      ),
      orderBy: [desc(festivalTermsVersions.versionNumber)],
      with: { sections: true },
    });
    expect(published?.status).toBe("published");
    expect(published?.versionNumber).toBe(1);
    expect(published?.sections.length).toBeGreaterThanOrEqual(19);
    expect(published?.sections.some((section) => section.kind === "schedule")).toBe(
      true,
    );

    const gastronomyOnly = filterSectionsForAudience(
      published!.sections,
      "gastronomy",
      "glitter",
    );
    const illustrationOnly = filterSectionsForAudience(
      published!.sections,
      "illustration",
      "glitter",
    );
    const festickerEntrepreneur = filterSectionsForAudience(
      published!.sections,
      "entrepreneurship",
      "festicker",
    );

    expect(
      gastronomyOnly.some((section) => section.title?.includes("2.1")),
    ).toBe(true);
    expect(
      illustrationOnly.some((section) => section.title?.includes("2.1")),
    ).toBe(false);
    expect(
      festickerEntrepreneur.some((section) =>
        Array.isArray(section.audienceFestivalTypes)
          ? section.audienceFestivalTypes.includes("festicker")
          : false,
      ),
    ).toBe(true);
  });

  it("stores terms_version_id per festival and requires a new acceptance on another festival", async () => {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const published = await db.query.festivalTermsVersions.findFirst({
      where: eq(festivalTermsVersions.status, "published"),
      orderBy: [desc(festivalTermsVersions.versionNumber)],
    });
    expect(published).toBeTruthy();

    const [user] = await db
      .insert(users)
      .values({
        clerkId: `integration-terms-${suffix}`,
        email: `integration-terms-${suffix}@example.test`,
        displayName: "Terms Participant",
        status: "verified",
        category: "illustration",
      })
      .returning();
    const [festivalA] = await db
      .insert(festivals)
      .values({
        name: `Terms Fest A ${suffix}`,
        status: "active",
        festivalType: "glitter",
      })
      .returning();
    const [festivalB] = await db
      .insert(festivals)
      .values({
        name: `Terms Fest B ${suffix}`,
        status: "active",
        festivalType: "glitter",
      })
      .returning();
    const [request] = await db
      .insert(userRequests)
      .values({
        userId: user.id,
        festivalId: festivalA.id,
        type: "festival_participation",
        status: "accepted",
        termsVersionId: published!.id,
      })
      .returning();

    fixtures.push({
      userId: user.id,
      festivalAId: festivalA.id,
      festivalBId: festivalB.id,
      requestId: request.id,
      extraVersionIds: [],
    });

    const profile = {
      userRequests: [
        {
          festivalId: festivalA.id,
          type: "festival_participation" as const,
          status: "accepted" as const,
          termsVersionId: request.termsVersionId,
        },
      ],
    };

    expect(
      hasAcceptedCurrentFestivalTerms(profile, festivalA.id, published!.id),
    ).toBe(true);
    expect(
      hasAcceptedCurrentFestivalTerms(profile, festivalB.id, published!.id),
    ).toBe(false);
    expect(
      needsFestivalTermsReacceptance(
        { id: festivalA.id, status: "active" },
        profile,
        published!.id,
      ),
    ).toBe(false);
    expect(nextEnrollmentTermsWrite(null, published!.id)).toEqual({
      type: "insert",
    });
    expect(
      nextEnrollmentTermsWrite(
        { termsVersionId: request.termsVersionId },
        published!.id,
      ),
    ).toEqual({ type: "noop" });
  });

  it("requires re-acceptance on an active festival after a new version is published", async () => {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const document = await db.query.festivalTermsDocuments.findFirst({
      where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
    });
    const published = await db.query.festivalTermsVersions.findFirst({
      where: eq(festivalTermsVersions.status, "published"),
      orderBy: [desc(festivalTermsVersions.versionNumber)],
    });
    expect(document && published).toBeTruthy();

    const [user] = await db
      .insert(users)
      .values({
        clerkId: `integration-terms-reaccept-${suffix}`,
        email: `integration-terms-reaccept-${suffix}@example.test`,
        displayName: "Terms Reaccept",
        status: "verified",
        category: "illustration",
      })
      .returning();
    const [festivalA] = await db
      .insert(festivals)
      .values({
        name: `Terms Reaccept A ${suffix}`,
        status: "active",
        festivalType: "glitter",
      })
      .returning();
    const [festivalB] = await db
      .insert(festivals)
      .values({
        name: `Terms Reaccept B ${suffix}`,
        status: "archived",
        festivalType: "glitter",
      })
      .returning();
    const [request] = await db
      .insert(userRequests)
      .values({
        userId: user.id,
        festivalId: festivalA.id,
        type: "festival_participation",
        status: "accepted",
        termsVersionId: published!.id,
      })
      .returning();
    await db
      .update(festivalTermsVersions)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(festivalTermsVersions.documentId, document!.id),
          eq(festivalTermsVersions.status, "published"),
        ),
      );
    const [newVersion] = await db
      .insert(festivalTermsVersions)
      .values({
        documentId: document!.id,
        versionNumber: 10_000 + Math.floor(Math.random() * 1000),
        status: "published",
        changelog: "integration re-accept",
        publishedAt: new Date(),
      })
      .returning();

    fixtures.push({
      userId: user.id,
      festivalAId: festivalA.id,
      festivalBId: festivalB.id,
      requestId: request.id,
      extraVersionIds: [newVersion.id],
      restoreDocumentId: document!.id,
      restorePublishedVersionId: published!.id,
    });

    const profile = {
      userRequests: [
        {
          festivalId: festivalA.id,
          type: "festival_participation" as const,
          status: "accepted" as const,
          termsVersionId: published!.id,
        },
        {
          festivalId: festivalB.id,
          type: "festival_participation" as const,
          status: "accepted" as const,
          termsVersionId: published!.id,
        },
      ],
    };

    expect(
      needsFestivalTermsReacceptance(
        { id: festivalA.id, status: "active" },
        profile,
        newVersion.id,
      ),
    ).toBe(true);
    expect(
      needsFestivalTermsReacceptance(
        { id: festivalB.id, status: "archived" },
        profile,
        newVersion.id,
      ),
    ).toBe(false);
    expect(
      nextEnrollmentTermsWrite(
        { termsVersionId: published!.id },
        newVersion.id,
      ),
    ).toEqual({ type: "reaccept" });

    const stale = await db.execute<{ count: string }>(
      sql`
        SELECT count(*)::text AS count
        FROM user_requests ur
        INNER JOIN festivals f ON f.id = ur.festival_id
        WHERE ur.type = 'festival_participation'
          AND f.status = 'active'
          AND ur.terms_version_id IS DISTINCT FROM ${newVersion.id}
          AND ur.id = ${request.id}
      `,
    );
    expect(Number(stale.rows[0]?.count ?? 0)).toBe(1);
  });

  it("allows only one published version per document", async () => {
    const db = integrationDb!;
    const document = await db.query.festivalTermsDocuments.findFirst({
      where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
    });
    expect(document).toBeTruthy();

    let insertError: unknown;
    try {
      await db.insert(festivalTermsVersions).values({
        documentId: document!.id,
        versionNumber: 20_000 + Math.floor(Math.random() * 1000),
        status: "published",
        publishedAt: new Date(),
      });
    } catch (error) {
      insertError = error;
    }
    expect(insertError).toBeTruthy();
    const message = [
      insertError instanceof Error ? insertError.message : String(insertError),
      insertError &&
      typeof insertError === "object" &&
      "cause" in insertError &&
      insertError.cause instanceof Error
        ? insertError.cause.message
        : "",
    ].join("\n");
    expect(message).toMatch(
      /festival_terms_versions_one_published_per_document|unique|duplicate key/i,
    );
  });

  it("archives existing published rows before promoting a draft", async () => {
    const db = integrationDb!;
    const document = await db.query.festivalTermsDocuments.findFirst({
      where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
    });
    const previousPublished = await db.query.festivalTermsVersions.findFirst({
      where: and(
        eq(festivalTermsVersions.documentId, document!.id),
        eq(festivalTermsVersions.status, "published"),
      ),
      orderBy: [desc(festivalTermsVersions.versionNumber)],
    });
    expect(previousPublished).toBeTruthy();

    await db
      .delete(festivalTermsVersions)
      .where(
        and(
          eq(festivalTermsVersions.documentId, document!.id),
          eq(festivalTermsVersions.status, "draft"),
        ),
      );

    const [maxRow] = await db
      .select({ max: max(festivalTermsVersions.versionNumber) })
      .from(festivalTermsVersions)
      .where(eq(festivalTermsVersions.documentId, document!.id));

    const [draft] = await db
      .insert(festivalTermsVersions)
      .values({
        documentId: document!.id,
        versionNumber: (maxRow?.max ?? previousPublished!.versionNumber) + 1,
        status: "draft",
        changelog: "publish archive test",
      })
      .returning();

    fixtures.push({
      userId: -1,
      festivalAId: -1,
      festivalBId: -1,
      requestId: -1,
      extraVersionIds: [draft.id],
      restoreDocumentId: document!.id,
      restorePublishedVersionId: previousPublished!.id,
    });

    // Mirrors publishFestivalTermsDraft: archive published, then promote draft.
    await db.transaction(async (tx) => {
      await tx
        .update(festivalTermsVersions)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          and(
            eq(festivalTermsVersions.documentId, document!.id),
            eq(festivalTermsVersions.status, "published"),
          ),
        );

      const [published] = await tx
        .update(festivalTermsVersions)
        .set({
          status: "published",
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(festivalTermsVersions.id, draft.id),
            eq(festivalTermsVersions.status, "draft"),
          ),
        )
        .returning({ id: festivalTermsVersions.id });

      expect(published).toBeTruthy();
    });

    const archived = await db.query.festivalTermsVersions.findFirst({
      where: eq(festivalTermsVersions.id, previousPublished!.id),
    });
    const newlyPublished = await db.query.festivalTermsVersions.findFirst({
      where: eq(festivalTermsVersions.id, draft.id),
    });
    expect(archived?.status).toBe("archived");
    expect(newlyPublished?.status).toBe("published");

    const publishedRows = await db.query.festivalTermsVersions.findMany({
      where: and(
        eq(festivalTermsVersions.documentId, document!.id),
        eq(festivalTermsVersions.status, "published"),
      ),
    });
    expect(publishedRows).toHaveLength(1);
    expect(publishedRows[0]?.id).toBe(draft.id);
  });
});
