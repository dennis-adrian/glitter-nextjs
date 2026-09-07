// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { PostStatus } from "@/app/lib/posts/definitions";
import * as schema from "@/db/schema";
import { posts, users } from "@/db/schema";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const currentProfile = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: vi.fn(async () => currentProfile.value),
}));

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

let actions: typeof import("@/app/lib/posts/actions");
let publishDueScheduledPosts: (typeof import("@/app/lib/posts/schedule"))["publishDueScheduledPosts"];

let AUTHOR: { id: number; role: string };
let ADMIN: { id: number; role: string };

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];
let counter = 0;

const HOUR = 60 * 60 * 1000;

async function makePost(
  status: PostStatus,
  scheduledAt: Date | null = null,
): Promise<number> {
  counter += 1;
  const [row] = await integrationDb!
    .insert(posts)
    .values({
      title: "Artículo programable",
      slug: `sched-${Date.now()}-${counter}`,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hola", styles: {} }],
        },
      ],
      contentHtml: "<p>Hola</p>",
      authorId: AUTHOR.id,
      status,
      scheduledAt,
    })
    .returning({ id: posts.id });
  createdPostIds.push(row.id);
  return row.id;
}

async function read(id: number) {
  const [row] = await integrationDb!
    .select()
    .from(posts)
    .where(eq(posts.id, id));
  return row;
}

describeDatabase("scheduled publishing", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    dbHolder.current = integrationDb as never;

    const probe = await pool!.query<{ col: string | null }>(
      "select column_name::text as col from information_schema.columns where table_name='posts' and column_name='scheduled_at'",
    );
    if (!probe.rows[0]?.col) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    const suffix = `${Date.now()}`;
    const rows = await integrationDb!
      .insert(users)
      .values([
        {
          clerkId: `s-author-${suffix}`,
          email: `s-author-${suffix}@example.test`,
        },
        {
          clerkId: `s-admin-${suffix}`,
          email: `s-admin-${suffix}@example.test`,
          role: "admin",
        },
      ])
      .returning({ id: users.id });
    createdUserIds.push(...rows.map((r) => r.id));

    AUTHOR = { id: rows[0].id, role: "artist" };
    ADMIN = { id: rows[1].id, role: "admin" };

    actions = await import("@/app/lib/posts/actions");
    ({ publishDueScheduledPosts } = await import("@/app/lib/posts/schedule"));
  }, 60_000);

  beforeEach(() => {
    currentProfile.value = ADMIN;
  });

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

  describe("schedulePost", () => {
    it("moves an approved post to scheduled", async () => {
      const id = await makePost("approved");
      const when = new Date(Date.now() + 2 * HOUR);

      await expect(actions.schedulePost(id, when)).resolves.toMatchObject({
        success: true,
      });

      const after = await read(id);
      expect(after.status).toBe("scheduled");
      expect(after.scheduledAt?.getTime()).toBe(when.getTime());
    });

    it("refuses a time in the past", async () => {
      const id = await makePost("approved");

      await expect(
        actions.schedulePost(id, new Date(Date.now() - HOUR)),
      ).resolves.toMatchObject({ success: false });
      expect((await read(id)).status).toBe("approved");
    });

    it("refuses a post that is not approved", async () => {
      for (const status of [
        "draft",
        "submitted",
        "published",
      ] as PostStatus[]) {
        const id = await makePost(status);
        await expect(
          actions.schedulePost(id, new Date(Date.now() + HOUR)),
        ).resolves.toMatchObject({ success: false });
      }
    });

    it("refuses a non-admin", async () => {
      const id = await makePost("approved");
      currentProfile.value = AUTHOR;

      await expect(
        actions.schedulePost(id, new Date(Date.now() + HOUR)),
      ).resolves.toMatchObject({ success: false });
    });

    it("lets an admin move an existing schedule", async () => {
      const id = await makePost("approved");
      await actions.schedulePost(id, new Date(Date.now() + HOUR));
      const moved = new Date(Date.now() + 3 * HOUR);

      await expect(actions.schedulePost(id, moved)).resolves.toMatchObject({
        success: true,
      });
      expect((await read(id)).scheduledAt?.getTime()).toBe(moved.getTime());
    });
  });

  describe("cancelSchedule", () => {
    /** Back to `approved`, not `draft` — the content was already blessed. */
    it("returns the post to approved and clears the time", async () => {
      const id = await makePost("scheduled", new Date(Date.now() + HOUR));

      await expect(actions.cancelSchedule(id)).resolves.toMatchObject({
        success: true,
      });

      const after = await read(id);
      expect(after.status).toBe("approved");
      expect(after.scheduledAt).toBeNull();
    });

    it("refuses a post that is not scheduled", async () => {
      const id = await makePost("approved");

      await expect(actions.cancelSchedule(id)).resolves.toMatchObject({
        success: false,
      });
    });
  });

  describe("publishDueScheduledPosts", () => {
    it("publishes a post whose time has passed", async () => {
      const when = new Date(Date.now() - 5 * 60_000);
      const id = await makePost("scheduled", when);

      const result = await publishDueScheduledPosts();

      expect(result.promoted).toBeGreaterThanOrEqual(1);
      const after = await read(id);
      expect(after.status).toBe("published");
      // Dated when the admin said, not when the sweep happened to run.
      expect(after.publishedAt?.getTime()).toBe(when.getTime());
    });

    it("leaves a future post alone", async () => {
      const id = await makePost("scheduled", new Date(Date.now() + 2 * HOUR));

      await publishDueScheduledPosts();

      expect((await read(id)).status).toBe("scheduled");
    });

    it("is idempotent — a second sweep promotes nothing new", async () => {
      const id = await makePost("scheduled", new Date(Date.now() - HOUR));
      await publishDueScheduledPosts();
      const firstPublishedAt = (await read(id)).publishedAt;

      const second = await publishDueScheduledPosts();

      expect(second.slugs).not.toContain((await read(id)).slug);
      expect((await read(id)).publishedAt?.getTime()).toBe(
        firstPublishedAt?.getTime(),
      );
    });

    it("ignores posts in other statuses even with a past scheduledAt", async () => {
      const id = await makePost("approved", new Date(Date.now() - HOUR));

      await publishDueScheduledPosts();

      expect((await read(id)).status).toBe("approved");
    });
  });

  describe("approve then publish", () => {
    it("approves without publishing, then publishes", async () => {
      const id = await makePost("submitted");

      await expect(actions.approvePost(id)).resolves.toMatchObject({
        success: true,
      });
      let after = await read(id);
      expect(after.status).toBe("approved");
      expect(after.publishedAt).toBeNull();

      await expect(actions.publishApproved(id)).resolves.toMatchObject({
        success: true,
      });
      after = await read(id);
      expect(after.status).toBe("published");
      expect(after.publishedAt).toBeInstanceOf(Date);
    });

    it("refuses to publish something not approved", async () => {
      const id = await makePost("submitted");

      await expect(actions.publishApproved(id)).resolves.toMatchObject({
        success: false,
      });
    });
  });
});
