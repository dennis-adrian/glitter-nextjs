// @vitest-environment node

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { paragraph } from "@/app/lib/festival-terms/blocks";
import { FESTIVAL_TERMS_DOCUMENT_SLUG } from "@/app/lib/festival-terms/constants";
import { toEditorSections } from "@/app/lib/festival-terms/editor";
import * as schema from "@/db/schema";
import {
  festivalTermsDocuments,
  festivalTermsSections,
  festivalTermsVersions,
} from "@/db/schema";

const fetchDraftFestivalTermsVersion = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => ({
  transaction: vi.fn(),
  query: {},
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: 1, role: "admin" }),
}));
vi.mock("@/app/lib/festival-terms/queries", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/festival-terms/queries")>();
  return {
    ...actual,
    fetchDraftFestivalTermsVersion,
  };
});
vi.mock("@/db", () => ({
  db: dbMock,
}));

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

let saveFestivalTermsDraft: (typeof import("@/app/lib/festival-terms/actions"))["saveFestivalTermsDraft"];

const extraVersionIds: number[] = [];

describeDatabase("festival terms draft save concurrency", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    dbMock.transaction.mockImplementation((callback) =>
      integrationDb!.transaction(callback),
    );

    ({ saveFestivalTermsDraft } = await import(
      "@/app/lib/festival-terms/actions"
    ));

    const result = await pool!.query<{ versions: string | null }>(
      "select to_regclass('public.festival_terms_versions')::text as versions",
    );
    if (!result.rows[0]?.versions) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  afterEach(async () => {
    fetchDraftFestivalTermsVersion.mockReset();
    const db = integrationDb!;
    const leftover = extraVersionIds.splice(0);
    for (const versionId of leftover) {
      await db
        .delete(festivalTermsVersions)
        .where(eq(festivalTermsVersions.id, versionId));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("rejects a stale save when publication commits between the initial read and the save transaction", async () => {
    const db = integrationDb!;
    const document = await db.query.festivalTermsDocuments.findFirst({
      where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
    });
    if (!document) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    await db
      .delete(festivalTermsVersions)
      .where(
        and(
          eq(festivalTermsVersions.documentId, document.id),
          eq(festivalTermsVersions.status, "draft"),
        ),
      );

    const [draft] = await db
      .insert(festivalTermsVersions)
      .values({
        documentId: document.id,
        versionNumber: 50_000 + Math.floor(Math.random() * 10_000),
        status: "draft",
        changelog: "original changelog",
      })
      .returning();
    extraVersionIds.push(draft.id);

    await db.insert(festivalTermsSections).values([
      {
        versionId: draft.id,
        sortOrder: 0,
        kind: "rich_text",
        layout: "plain",
        title: "Published title",
        bodyJson: [paragraph("Published body")],
        bodyHtml: "<p>Published body</p>",
        audienceCategories: [],
        audienceFestivalTypes: [],
      },
      {
        versionId: draft.id,
        sortOrder: 1,
        kind: "schedule",
        layout: "plain",
        title: "Horarios",
        bodyJson: null,
        bodyHtml: null,
        audienceCategories: [],
        audienceFestivalTypes: [],
      },
    ]);

    const originallyRead = await db.query.festivalTermsVersions.findFirst({
      where: eq(festivalTermsVersions.id, draft.id),
      with: { sections: true },
    });
    expect(originallyRead?.status).toBe("draft");

    await db
      .update(festivalTermsVersions)
      .set({
        status: "published",
        publishedAt: new Date(),
        changelog: "published changelog",
      })
      .where(eq(festivalTermsVersions.id, draft.id));

    fetchDraftFestivalTermsVersion.mockResolvedValue({
      ...originallyRead!,
      publishedBy: null,
      createdBy: null,
    });

    const staleSections = toEditorSections(originallyRead!.sections).map(
      (section) =>
        section.kind === "rich_text"
          ? { ...section, title: "Stale overwrite" }
          : section,
    );

    const result = await saveFestivalTermsDraft({
      changelog: "stale changelog",
      sections: staleSections,
    });

    expect(result).toEqual({
      success: false,
      message: "El borrador ya no está disponible",
    });

    const published = await db.query.festivalTermsVersions.findFirst({
      where: eq(festivalTermsVersions.id, draft.id),
      with: { sections: true },
    });
    expect(published?.status).toBe("published");
    expect(published?.changelog).toBe("published changelog");
    expect(
      published?.sections
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((section) => ({
          kind: section.kind,
          title: section.title,
        })),
    ).toEqual([
      { kind: "rich_text", title: "Published title" },
      { kind: "schedule", title: "Horarios" },
    ]);
  });
});
