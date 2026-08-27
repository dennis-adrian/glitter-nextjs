// @vitest-environment node

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import {
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

let countStaleActiveFestivalAcceptances: (typeof import("@/app/lib/festival-terms/queries"))["countStaleActiveFestivalAcceptances"];

type Fixture = {
  userId: number;
  festivalIds: number[];
  requestIds: number[];
  extraVersionIds: number[];
};

const fixtures: Fixture[] = [];

describeDatabase("countStaleActiveFestivalAcceptances", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    ({ countStaleActiveFestivalAcceptances } = await import(
      "@/app/lib/festival-terms/queries"
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
    const db = integrationDb!;
    const leftover = fixtures.splice(0);
    for (const fixture of leftover) {
      for (const requestId of fixture.requestIds) {
        await db.delete(userRequests).where(eq(userRequests.id, requestId));
      }
      for (const festivalId of fixture.festivalIds) {
        await db.delete(festivals).where(eq(festivals.id, festivalId));
      }
      for (const versionId of fixture.extraVersionIds) {
        await db
          .delete(festivalTermsVersions)
          .where(eq(festivalTermsVersions.id, versionId));
      }
      if (fixture.userId > 0) {
        await db.delete(users).where(eq(users.id, fixture.userId));
      }
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("counts stale acceptances only for active festivals with participant terms enabled", async () => {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const published = await db.query.festivalTermsVersions.findFirst({
      where: eq(festivalTermsVersions.status, "published"),
      orderBy: [desc(festivalTermsVersions.versionNumber)],
    });
    expect(published).toBeTruthy();

    const [staleVersion] = await db
      .insert(festivalTermsVersions)
      .values({
        documentId: published!.documentId,
        versionNumber: 30_000 + Math.floor(Math.random() * 1000),
        status: "archived",
        changelog: "stale count fixture",
      })
      .returning();

    const [user] = await db
      .insert(users)
      .values({
        clerkId: `integration-stale-count-${suffix}`,
        email: `integration-stale-count-${suffix}@example.test`,
        displayName: "Stale Count Participant",
        status: "verified",
        category: "illustration",
      })
      .returning();

    const [enabledFestival] = await db
      .insert(festivals)
      .values({
        name: `Stale Count Enabled ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: true,
      })
      .returning();
    const [disabledFestival] = await db
      .insert(festivals)
      .values({
        name: `Stale Count Disabled ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: false,
      })
      .returning();

    const staleVersionId = staleVersion.id;
    const [enabledRequest] = await db
      .insert(userRequests)
      .values({
        userId: user.id,
        festivalId: enabledFestival.id,
        type: "festival_participation",
        status: "accepted",
        termsVersionId: staleVersionId,
      })
      .returning();
    const [disabledRequest] = await db
      .insert(userRequests)
      .values({
        userId: user.id,
        festivalId: disabledFestival.id,
        type: "festival_participation",
        status: "accepted",
        termsVersionId: staleVersionId,
      })
      .returning();

    fixtures.push({
      userId: user.id,
      festivalIds: [enabledFestival.id, disabledFestival.id],
      requestIds: [enabledRequest.id, disabledRequest.id],
      extraVersionIds: [staleVersion.id],
    });

    const count = await countStaleActiveFestivalAcceptances(published!.id);
    expect(count).toBe(1);
  });
});
