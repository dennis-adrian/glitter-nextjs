// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PostStatus } from "@/app/lib/posts/definitions";
import * as schema from "@/db/schema";
import { posts, users } from "@/db/schema";

vi.mock("server-only", () => ({}));

const dbHolder = vi.hoisted(() => ({ current: null as never }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const value = (dbHolder.current as never as Record<string, unknown>)[
          prop as string
        ];
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(dbHolder.current)
          : value;
      },
    },
  ),
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

let detachPostsForDeletedUser: (typeof import("@/app/lib/posts/anonymization"))["detachPostsForDeletedUser"];

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];

let counter = 0;

async function makeUser(): Promise<number> {
  counter += 1;
  const suffix = `${Date.now()}-${counter}`;
  const [row] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `blog-anon-${suffix}`,
      email: `blog-anon-${suffix}@example.test`,
    })
    .returning({ id: users.id });
  createdUserIds.push(row.id);
  return row.id;
}

async function makePost(authorId: number, status: PostStatus) {
  counter += 1;
  const [row] = await integrationDb!
    .insert(posts)
    .values({
      title: `Artículo ${status}`,
      slug: `anon-${Date.now()}-${counter}`,
      content: [{ type: "paragraph", content: [] }],
      contentHtml: "<p></p>",
      authorId,
      status,
      publishedAt: status === "published" ? new Date() : null,
    })
    .returning({ id: posts.id });
  createdPostIds.push(row.id);
  return row.id;
}

describeDatabase("detachPostsForDeletedUser", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    dbHolder.current = integrationDb as never;

    const probe = await pool!.query<{ posts: string | null }>(
      "select to_regclass('public.posts')::text as posts",
    );
    if (!probe.rows[0]?.posts) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    ({ detachPostsForDeletedUser } =
      await import("@/app/lib/posts/anonymization"));
  }, 60_000);

  afterAll(async () => {
    const db = integrationDb;
    if (db) {
      if (createdPostIds.length > 0) {
        await db.delete(posts).where(inArray(posts.id, createdPostIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
    }
    await pool?.end();
  });

  it("keeps published and archived posts, with the author detached", async () => {
    const userId = await makeUser();
    const published = await makePost(userId, "published");
    const archived = await makePost(userId, "archived");

    const result = await detachPostsForDeletedUser(
      integrationDb! as never,
      userId,
    );

    expect(result.detached).toBe(2);
    const rows = await integrationDb!
      .select()
      .from(posts)
      .where(inArray(posts.id, [published, archived]));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.authorId).toBeNull();
    }
  });

  it("deletes everything that never reached a reader", async () => {
    const userId = await makeUser();
    const ids = [
      await makePost(userId, "draft"),
      await makePost(userId, "submitted"),
      await makePost(userId, "approved"),
      await makePost(userId, "scheduled"),
      await makePost(userId, "rejected"),
    ];

    const result = await detachPostsForDeletedUser(
      integrationDb! as never,
      userId,
    );

    expect(result.deleted).toBe(5);
    const rows = await integrationDb!
      .select()
      .from(posts)
      .where(inArray(posts.id, ids));
    expect(rows).toHaveLength(0);
  });

  it("leaves other people's posts alone", async () => {
    const departing = await makeUser();
    const staying = await makeUser();
    await makePost(departing, "draft");
    const theirs = await makePost(staying, "draft");

    await detachPostsForDeletedUser(integrationDb! as never, departing);

    const [row] = await integrationDb!
      .select()
      .from(posts)
      .where(eq(posts.id, theirs));
    expect(row.authorId).toBe(staying);
  });

  /**
   * The regression this whole module exists for: `posts.authorId` used to be
   * ON DELETE RESTRICT, so a contributor who had ever written anything could
   * not be deleted, and the deletion outbox retried the failure forever.
   */
  it("lets the user row delete afterwards", async () => {
    const userId = await makeUser();
    await makePost(userId, "published");
    await makePost(userId, "draft");

    await detachPostsForDeletedUser(integrationDb! as never, userId);

    await expect(
      integrationDb!.delete(users).where(eq(users.id, userId)),
    ).resolves.toBeDefined();

    const [gone] = await integrationDb!
      .select()
      .from(users)
      .where(eq(users.id, userId));
    expect(gone).toBeUndefined();
  });

  it("survives a user who never wrote anything", async () => {
    const userId = await makeUser();

    await expect(
      detachPostsForDeletedUser(integrationDb! as never, userId),
    ).resolves.toEqual({ deleted: 0, detached: 0 });
  });
});
