// @vitest-environment node

import { and, desc, eq, max } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { FESTIVAL_TERMS_DOCUMENT_SLUG } from "@/app/lib/festival-terms/constants";
import * as schema from "@/db/schema";
import {
  festivalTermsDocuments,
  festivalTermsVersions,
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

const createdVersionIds: number[] = [];
let seedPublishedId: number | null = null;

describeDatabase("festival terms publish archives previous", () => {
  beforeAll(async () => {
    const document = await integrationDb!.query.festivalTermsDocuments.findFirst(
      {
        where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
      },
    );
    if (!document) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
    const published = await integrationDb!.query.festivalTermsVersions.findFirst(
      {
        where: and(
          eq(festivalTermsVersions.documentId, document.id),
          eq(festivalTermsVersions.status, "published"),
        ),
      },
    );
    seedPublishedId = published?.id ?? null;
  });

  afterEach(async () => {
    const db = integrationDb!;
    const ids = createdVersionIds.splice(0);
    if (seedPublishedId != null) {
      const seed = await db.query.festivalTermsVersions.findFirst({
        where: eq(festivalTermsVersions.id, seedPublishedId),
      });
      if (seed && seed.status !== "published") {
        await db
          .update(festivalTermsVersions)
          .set({ status: "archived", updatedAt: new Date() })
          .where(
            and(
              eq(festivalTermsVersions.documentId, seed.documentId),
              eq(festivalTermsVersions.status, "published"),
            ),
          );
        await db
          .update(festivalTermsVersions)
          .set({ status: "published", updatedAt: new Date() })
          .where(eq(festivalTermsVersions.id, seedPublishedId));
      }
    }
    for (const id of ids) {
      if (id === seedPublishedId) continue;
      await db
        .delete(festivalTermsVersions)
        .where(eq(festivalTermsVersions.id, id));
    }
  });

  afterAll(async () => {
    await pool?.end();
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

  it("archives existing published rows before promoting a draft (publish path)", async () => {
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
    createdVersionIds.push(draft.id);

    // Mirrors publishFestivalTermsDraft: archive published, then promote draft.
    await db.transaction(async (tx) => {
      const currentDraft = await tx.query.festivalTermsVersions.findFirst({
        where: and(
          eq(festivalTermsVersions.id, draft.id),
          eq(festivalTermsVersions.status, "draft"),
        ),
      });
      expect(currentDraft).toBeTruthy();

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
