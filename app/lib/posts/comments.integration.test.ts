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

import type { PostAudience } from "@/app/lib/posts/definitions";
import * as schema from "@/db/schema";
import { postComments, posts, users } from "@/db/schema";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

let actions: typeof import("@/app/lib/posts/comment-actions");
/**
 * Loaded in the same `beforeAll` as the rest. A nested one inherits the
 * default hook timeout, and importing this module is slow enough — it reaches
 * the renderer — to blow past it on a loaded machine, which skipped the whole
 * closed-thread block and failed the file.
 */
let postActions: typeof import("@/app/lib/posts/actions");
let fetchCommentThread: (typeof import("@/app/lib/posts/comments"))["fetchCommentThread"];

let READER: { id: number; role: string; status: string };
let OTHER: { id: number; role: string; status: string };
let PENDING: { id: number; role: string; status: string };
let ADMIN: { id: number; role: string; status: string };

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];
let counter = 0;

async function makePost(audience: PostAudience = "public") {
  counter += 1;
  const [row] = await integrationDb!
    .insert(posts)
    .values({
      title: "Artículo con comentarios",
      slug: `comments-${Date.now()}-${counter}`,
      content: [{ type: "paragraph", content: [] }],
      contentHtml: "<p></p>",
      authorId: READER.id,
      status: "published",
      publishedAt: new Date(),
      audience,
    })
    .returning({ id: posts.id });
  createdPostIds.push(row.id);
  return row.id;
}

describeDatabase("blog comments", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    dbHolder.current = integrationDb as never;

    const probe = await pool!.query<{ table: string | null }>(
      "select to_regclass('public.post_comments')::text as table",
    );
    if (!probe.rows[0]?.table) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    const suffix = `${Date.now()}`;
    const rows = await integrationDb!
      .insert(users)
      .values([
        {
          clerkId: `c-reader-${suffix}`,
          email: `c-reader-${suffix}@example.test`,
          status: "verified",
        },
        {
          clerkId: `c-other-${suffix}`,
          email: `c-other-${suffix}@example.test`,
          status: "verified",
        },
        {
          clerkId: `c-pending-${suffix}`,
          email: `c-pending-${suffix}@example.test`,
          status: "pending",
        },
        {
          clerkId: `c-admin-${suffix}`,
          email: `c-admin-${suffix}@example.test`,
          role: "admin",
          status: "verified",
        },
      ])
      .returning({ id: users.id });
    createdUserIds.push(...rows.map((r) => r.id));

    READER = { id: rows[0].id, role: "artist", status: "verified" };
    OTHER = { id: rows[1].id, role: "artist", status: "verified" };
    PENDING = { id: rows[2].id, role: "artist", status: "pending" };
    ADMIN = { id: rows[3].id, role: "admin", status: "verified" };

    actions = await import("@/app/lib/posts/comment-actions");
    postActions = await import("@/app/lib/posts/actions");
    ({ fetchCommentThread } = await import("@/app/lib/posts/comments"));
  }, 60_000);

  beforeEach(() => {
    currentProfile.value = READER;
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

  it("posts a comment and reads it back in the thread", async () => {
    const postId = await makePost();

    await expect(
      actions.addComment(postId, "Muy útil, gracias"),
    ).resolves.toMatchObject({ success: true });

    const thread = await fetchCommentThread(postId);
    expect(thread).toHaveLength(1);
    expect(thread[0].body).toBe("Muy útil, gracias");
    expect(thread[0].replies).toHaveLength(0);
  });

  it("refuses an empty or oversized comment", async () => {
    const postId = await makePost();

    await expect(actions.addComment(postId, "   ")).resolves.toMatchObject({
      success: false,
    });
    await expect(
      actions.addComment(postId, "x".repeat(1001)),
    ).resolves.toMatchObject({ success: false });
  });

  it("refuses a comment from someone signed out", async () => {
    const postId = await makePost();
    currentProfile.value = null;

    await expect(actions.addComment(postId, "Hola")).resolves.toMatchObject({
      success: false,
    });
  });

  it("nests one level of replies", async () => {
    const postId = await makePost();
    await actions.addComment(postId, "Comentario raíz");
    const [root] = await fetchCommentThread(postId);

    await expect(
      actions.addComment(postId, "Una respuesta", root.id),
    ).resolves.toMatchObject({ success: true });

    const thread = await fetchCommentThread(postId);
    expect(thread).toHaveLength(1);
    expect(thread[0].replies).toHaveLength(1);
    expect(thread[0].replies[0].body).toBe("Una respuesta");
  });

  it("refuses to reply to a reply", async () => {
    const postId = await makePost();
    await actions.addComment(postId, "Raíz");
    const [root] = await fetchCommentThread(postId);
    await actions.addComment(postId, "Respuesta", root.id);
    const [withReply] = await fetchCommentThread(postId);
    const replyId = withReply.replies[0].id;

    await expect(
      actions.addComment(postId, "Respuesta anidada", replyId),
    ).resolves.toMatchObject({ success: false });
  });

  it("refuses a parent that belongs to another post", async () => {
    const postA = await makePost();
    const postB = await makePost();
    await actions.addComment(postA, "En A");
    const [rootA] = await fetchCommentThread(postA);

    await expect(
      actions.addComment(postB, "Desde B", rootA.id),
    ).resolves.toMatchObject({ success: false });
  });

  describe("audience gate", () => {
    it("refuses a comment on a restricted post from a viewer without access", async () => {
      const postId = await makePost("participants");
      currentProfile.value = PENDING;

      await expect(actions.addComment(postId, "Hola")).resolves.toMatchObject({
        success: false,
      });
      expect(await fetchCommentThread(postId)).toHaveLength(0);
    });

    it("allows a verified participant on a restricted post", async () => {
      const postId = await makePost("participants");
      currentProfile.value = OTHER;

      await expect(
        actions.addComment(postId, "Buenísimo"),
      ).resolves.toMatchObject({ success: true });
    });
  });

  describe("rate limit", () => {
    it("allows five comments on a post and refuses the sixth", async () => {
      const postId = await makePost();

      for (let i = 0; i < 5; i += 1) {
        await expect(
          actions.addComment(postId, `Comentario ${i}`),
        ).resolves.toMatchObject({ success: true });
      }

      await expect(
        actions.addComment(postId, "Uno de más"),
      ).resolves.toMatchObject({ success: false });
    });

    it("counts per post, so another article is unaffected", async () => {
      const busy = await makePost();
      const quiet = await makePost();
      for (let i = 0; i < 5; i += 1) {
        await actions.addComment(busy, `Comentario ${i}`);
      }

      await expect(
        actions.addComment(quiet, "Primero acá"),
      ).resolves.toMatchObject({ success: true });
    });

    /** Deleting your own comment must not refund an allowance slot. */
    it("still counts a comment the author deleted", async () => {
      const postId = await makePost();
      for (let i = 0; i < 5; i += 1) {
        await actions.addComment(postId, `Comentario ${i}`);
      }
      const thread = await fetchCommentThread(postId);
      await actions.deleteOwnComment(thread[0].id);

      await expect(
        actions.addComment(postId, "Otro más"),
      ).resolves.toMatchObject({ success: false });
    });
  });

  describe("closed thread", () => {
    async function closedPost() {
      const postId = await makePost();
      currentProfile.value = ADMIN;
      await expect(
        postActions.setCommentsEnabled(postId, false),
      ).resolves.toMatchObject({ success: true });
      currentProfile.value = READER;
      return postId;
    }

    it("refuses a new comment", async () => {
      const postId = await closedPost();

      await expect(actions.addComment(postId, "Llego tarde")).resolves.toMatchObject({
        success: false,
      });
      expect(await fetchCommentThread(postId)).toHaveLength(0);
    });

    it("refuses a reply as well as a top-level comment", async () => {
      const postId = await makePost();
      await actions.addComment(postId, "El primero");
      const [comment] = await fetchCommentThread(postId);

      currentProfile.value = ADMIN;
      await postActions.setCommentsEnabled(postId, false);
      currentProfile.value = READER;

      await expect(
        actions.addComment(postId, "Una respuesta", comment.id),
      ).resolves.toMatchObject({ success: false });
      expect((await fetchCommentThread(postId))[0].replies).toHaveLength(0);
    });

    /**
     * Closing is not erasing. The comments people already left stay readable —
     * that is the whole difference between this and hiding the section.
     */
    it("keeps the comments already posted", async () => {
      const postId = await makePost();
      await actions.addComment(postId, "Escrito mientras estaba abierto");

      currentProfile.value = ADMIN;
      await postActions.setCommentsEnabled(postId, false);

      const thread = await fetchCommentThread(postId);
      expect(thread).toHaveLength(1);
      expect(thread[0].body).toBe("Escrito mientras estaba abierto");
    });

    it("takes comments again once reopened", async () => {
      const postId = await closedPost();

      currentProfile.value = ADMIN;
      await expect(
        postActions.setCommentsEnabled(postId, true),
      ).resolves.toMatchObject({ success: true });

      currentProfile.value = READER;
      await expect(
        actions.addComment(postId, "Ahora sí"),
      ).resolves.toMatchObject({ success: true });
      expect(await fetchCommentThread(postId)).toHaveLength(1);
    });

    it("refuses to toggle for someone who cannot edit the post", async () => {
      const postId = await makePost();
      currentProfile.value = OTHER;

      await expect(
        postActions.setCommentsEnabled(postId, false),
      ).resolves.toMatchObject({ success: false });

      currentProfile.value = READER;
      await expect(
        actions.addComment(postId, "Sigue abierto"),
      ).resolves.toMatchObject({ success: true });
    });

    it("refuses to toggle for an anonymous caller", async () => {
      const postId = await makePost();
      currentProfile.value = null;

      await expect(
        postActions.setCommentsEnabled(postId, false),
      ).resolves.toMatchObject({ success: false });
    });

    it("defaults to open", async () => {
      const postId = await makePost();

      await expect(
        actions.addComment(postId, "Sin tocar nada"),
      ).resolves.toMatchObject({ success: true });
    });
  });

  describe("moderation", () => {
    it("hides a comment from the thread when an admin hides it", async () => {
      const postId = await makePost();
      await actions.addComment(postId, "Para ocultar");
      const [comment] = await fetchCommentThread(postId);

      currentProfile.value = ADMIN;
      await expect(actions.hideComment(comment.id)).resolves.toMatchObject({
        success: true,
      });

      expect(await fetchCommentThread(postId)).toHaveLength(0);
    });

    it("refuses to hide for a non-admin", async () => {
      const postId = await makePost();
      await actions.addComment(postId, "Intocable");
      const [comment] = await fetchCommentThread(postId);

      currentProfile.value = OTHER;
      await expect(actions.hideComment(comment.id)).resolves.toMatchObject({
        success: false,
      });
      expect(await fetchCommentThread(postId)).toHaveLength(1);
    });

    it("lets an author delete their own comment but not someone else's", async () => {
      const postId = await makePost();
      await actions.addComment(postId, "Mío");
      const [mine] = await fetchCommentThread(postId);

      currentProfile.value = OTHER;
      await expect(actions.deleteOwnComment(mine.id)).resolves.toMatchObject({
        success: false,
      });

      currentProfile.value = READER;
      await expect(actions.deleteOwnComment(mine.id)).resolves.toMatchObject({
        success: true,
      });
      expect(await fetchCommentThread(postId)).toHaveLength(0);
    });

    it("takes replies with a hidden parent", async () => {
      const postId = await makePost();
      await actions.addComment(postId, "Raíz");
      const [root] = await fetchCommentThread(postId);
      await actions.addComment(postId, "Respuesta visible", root.id);

      currentProfile.value = ADMIN;
      await actions.hideComment(root.id);

      // The reply row survives, but nothing renders it once its parent is gone.
      const thread = await fetchCommentThread(postId);
      expect(thread).toHaveLength(0);
    });
  });

  it("deletes comments with their author", async () => {
    const postId = await makePost();
    const [doomed] = await integrationDb!
      .insert(users)
      .values({
        clerkId: `c-doomed-${Date.now()}`,
        email: `c-doomed-${Date.now()}@example.test`,
        status: "verified",
      })
      .returning({ id: users.id });

    currentProfile.value = {
      id: doomed.id,
      role: "artist",
      status: "verified",
    };
    await actions.addComment(postId, "Se va conmigo");
    expect(await fetchCommentThread(postId)).toHaveLength(1);

    await integrationDb!.delete(users).where(eq(users.id, doomed.id));

    expect(await fetchCommentThread(postId)).toHaveLength(0);
    const leftover = await integrationDb!
      .select()
      .from(postComments)
      .where(eq(postComments.postId, postId));
    expect(leftover).toHaveLength(0);
  });
});
