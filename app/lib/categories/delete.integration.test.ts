// @vitest-environment node

import { eq } from "drizzle-orm";
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

import * as schema from "@/db/schema";
import { profileSubcategories, subcategories, users } from "@/db/schema";

vi.mock("server-only", () => ({}));

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

const poolA = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 1 })
  : null;
const poolB = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 1 })
  : null;
const dbA = poolA ? drizzle(poolA, { schema }) : null;
const dbB = poolB ? drizzle(poolB, { schema }) : null;
const describeDatabase = dbA && dbB ? describe : describe.skip;

let deleteCategoryRecord: (typeof import("@/app/lib/categories/delete-persist"))["deleteCategoryRecord"];

const createdUserIds: number[] = [];
const createdCategoryIds: number[] = [];

describeDatabase("deleteCategory concurrent relationship insert", () => {
  beforeAll(async () => {
    ({ deleteCategoryRecord } =
      await import("@/app/lib/categories/delete-persist"));
  }, 60_000);

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      for (const id of createdUserIds) {
        await dbA!
          .delete(profileSubcategories)
          .where(eq(profileSubcategories.profileId, id));
        await dbA!.delete(users).where(eq(users.id, id));
      }
      createdUserIds.length = 0;
    }
    if (createdCategoryIds.length > 0) {
      for (const id of createdCategoryIds) {
        await dbA!.delete(subcategories).where(eq(subcategories.id, id));
      }
      createdCategoryIds.length = 0;
    }
  });

  afterAll(async () => {
    await poolA?.end();
    await poolB?.end();
  });

  it("never deletes a category after a verified profile association commits", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [category] = await dbA!
      .insert(subcategories)
      .values({
        label: `Lock test ${suffix}`,
        category: "illustration",
      })
      .returning({ id: subcategories.id });
    createdCategoryIds.push(category.id);

    const [profile] = await dbA!
      .insert(users)
      .values({
        clerkId: `lock_test_${suffix}`,
        email: `lock-test-${suffix}@example.com`,
        status: "verified",
      })
      .returning({ id: users.id });
    createdUserIds.push(profile.id);

    const [deleteResult, insertResult] = await Promise.allSettled([
      dbA!.transaction((tx) => deleteCategoryRecord(tx, category.id)),
      dbB!
        .insert(profileSubcategories)
        .values({
          profileId: profile.id,
          subcategoryId: category.id,
        })
        .returning({ id: profileSubcategories.id }),
    ]);

    const categoryRows = await dbA!
      .select({ id: subcategories.id })
      .from(subcategories)
      .where(eq(subcategories.id, category.id));
    const categoryExists = categoryRows.length > 0;

    const insertSucceeded = insertResult.status === "fulfilled";
    const deleteSucceeded =
      deleteResult.status === "fulfilled" && deleteResult.value.success;

    if (insertSucceeded) {
      expect(categoryExists).toBe(true);
      expect(deleteSucceeded).toBe(false);
      if (deleteResult.status === "fulfilled") {
        expect(deleteResult.value.success).toBe(false);
        if (!deleteResult.value.success) {
          expect(deleteResult.value.blocked).toBe(true);
        }
      }
    }

    if (deleteSucceeded) {
      expect(insertSucceeded).toBe(false);
      expect(categoryExists).toBe(false);
    }

    expect(insertSucceeded && deleteSucceeded).toBe(false);
    expect(insertSucceeded || deleteSucceeded).toBe(true);
  });
});
