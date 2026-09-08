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

/**
 * Forwards every `db.*` access to the real client, which is only available
 * once `beforeAll` has built it. Methods are bound so `db.transaction(...)`
 * keeps its receiver.
 */
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
let ensureUniquePostSlug: (typeof import("@/app/lib/posts/slug"))["ensureUniquePostSlug"];
let slugifyName: (typeof import("@/app/lib/posts/slug"))["slugifyName"];
let fetchSubmittedPostsForReview: (typeof import("@/app/lib/posts/data"))["fetchSubmittedPostsForReview"];

let AUTHOR: { id: number; role: string };
let ADMIN: { id: number; role: string };
let OTHER: { id: number; role: string };

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];

const DOC = (text: string) => [
  { type: "paragraph", content: [{ type: "text", text, styles: {} }] },
];

let slugCounter = 0;

async function makePost(
  overrides: Partial<typeof posts.$inferInsert> = {},
): Promise<typeof posts.$inferSelect> {
  slugCounter += 1;
  const [row] = await integrationDb!
    .insert(posts)
    .values({
      title: "Cómo armar tu stand",
      slug: `blog-test-${Date.now()}-${slugCounter}`,
      content: DOC("Contenido real."),
      contentHtml: "<p>Contenido real.</p>",
      authorId: AUTHOR.id,
      status: "draft",
      ...overrides,
    })
    .returning();
  createdPostIds.push(row.id);
  return row;
}

async function read(id: number) {
  const [row] = await integrationDb!
    .select()
    .from(posts)
    .where(eq(posts.id, id));
  return row;
}

describeDatabase("blog editorial actions", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    dbHolder.current = integrationDb as never;

    const probe = await pool!.query<{ posts: string | null }>(
      "select to_regclass('public.posts')::text as posts",
    );
    if (!probe.rows[0]?.posts) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    const suffix = `${Date.now()}`;
    const rows = await integrationDb!
      .insert(users)
      .values([
        {
          clerkId: `blog-author-${suffix}`,
          email: `blog-author-${suffix}@example.test`,
        },
        {
          clerkId: `blog-admin-${suffix}`,
          email: `blog-admin-${suffix}@example.test`,
          role: "admin",
        },
        {
          clerkId: `blog-other-${suffix}`,
          email: `blog-other-${suffix}@example.test`,
        },
      ])
      .returning({ id: users.id });
    createdUserIds.push(...rows.map((row) => row.id));

    AUTHOR = { id: rows[0].id, role: "artist" };
    ADMIN = { id: rows[1].id, role: "admin" };
    OTHER = { id: rows[2].id, role: "artist" };

    actions = await import("@/app/lib/posts/actions");
    ({ ensureUniquePostSlug, slugifyName } = await import(
      "@/app/lib/posts/slug"
    ));
    ({ fetchSubmittedPostsForReview } = await import("@/app/lib/posts/data"));
  }, 60_000);

  beforeEach(() => {
    currentProfile.value = AUTHOR;
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

  describe("submitForReview", () => {
    it("moves the author's draft to submitted and stamps submittedAt", async () => {
      const post = await makePost();

      await expect(actions.submitForReview(post.id)).resolves.toMatchObject({
        success: true,
      });

      const after = await read(post.id);
      expect(after.status).toBe("submitted");
      expect(after.submittedAt).toBeInstanceOf(Date);
      expect(after.reviewerNotes).toBeNull();
    });

    it("refuses a draft written by somebody else", async () => {
      const post = await makePost();
      currentProfile.value = OTHER;

      await expect(actions.submitForReview(post.id)).resolves.toMatchObject({
        success: false,
      });
      expect((await read(post.id)).status).toBe("draft");
    });

    it("refuses a draft with no real content", async () => {
      const post = await makePost({ content: [], contentHtml: "" });

      const result = await actions.submitForReview(post.id);

      expect(result).toMatchObject({ success: false });
      expect((await read(post.id)).status).toBe("draft");
    });

    it("refuses a draft whose title is still too short", async () => {
      const post = await makePost({ title: "ab" });

      await expect(actions.submitForReview(post.id)).resolves.toMatchObject({
        success: false,
      });
    });

    /**
     * The title is made unique per run on purpose. Asserting a fixed
     * `guia-de-luz` meant any leftover row holding that slug — a crashed run,
     * a fixture — sent `ensureUniquePostSlug` down the suffix path and failed
     * a test that has nothing to do with collisions.
     */
    it("replaces a placeholder slug on the way out of draft", async () => {
      const title = `Guía de luz ${Date.now()}`;
      const post = await makePost({ slug: "borrador-99", title });

      await actions.submitForReview(post.id);

      expect((await read(post.id)).slug).toBe(slugifyName(title));
    });

    it("keeps a slug the author already chose", async () => {
      const chosen = `mi-slug-${Date.now()}`;
      const post = await makePost({ slug: chosen });

      await actions.submitForReview(post.id);

      expect((await read(post.id)).slug).toBe(chosen);
    });
  });

  describe("review decisions", () => {
    it("refuses every decision to a non-staff caller", async () => {
      const post = await makePost({ status: "submitted" });
      currentProfile.value = AUTHOR;

      await expect(actions.approvePost(post.id)).resolves.toMatchObject({
        success: false,
      });
      await expect(
        actions.requestChanges(post.id, { notes: "Falta la portada" }),
      ).resolves.toMatchObject({ success: false });
      await expect(
        actions.rejectPost(post.id, { notes: "No encaja con el blog" }),
      ).resolves.toMatchObject({ success: false });

      expect((await read(post.id)).status).toBe("submitted");
    });

    it("approves a submitted post and records the reviewer, without publishing", async () => {
      const post = await makePost({ status: "submitted" });
      currentProfile.value = ADMIN;

      await expect(actions.approvePost(post.id)).resolves.toMatchObject({
        success: true,
      });

      const after = await read(post.id);
      expect(after.status).toBe("approved");
      expect(after.publishedAt).toBeNull();
      expect(after.reviewerId).toBe(ADMIN.id);
    });

    it("refuses to approve something that was never submitted", async () => {
      const post = await makePost({ status: "draft" });
      currentProfile.value = ADMIN;

      await expect(actions.approvePost(post.id)).resolves.toMatchObject({
        success: false,
      });
      expect((await read(post.id)).status).toBe("draft");
    });

    it("returns a submitted post to draft with the reviewer's notes", async () => {
      const post = await makePost({ status: "submitted" });
      currentProfile.value = ADMIN;

      await expect(
        actions.requestChanges(post.id, { notes: "Falta la portada" }),
      ).resolves.toMatchObject({ success: true });

      const after = await read(post.id);
      expect(after.status).toBe("draft");
      expect(after.reviewerNotes).toBe("Falta la portada");
      expect(after.reviewerId).toBe(ADMIN.id);
    });

    /**
     * Approving no longer publishes, so there is a window where a post is
     * blessed but not out yet. Without this the window was one-way: an article
     * approved by mistake could only be pushed forward.
     */
    it("returns an approved post to draft with notes", async () => {
      const post = await makePost({ status: "approved" });
      currentProfile.value = ADMIN;

      await expect(
        actions.requestChanges(post.id, {
          notes: "Mejor esperemos al festival",
        }),
      ).resolves.toMatchObject({ success: true });

      const after = await read(post.id);
      expect(after.status).toBe("draft");
      expect(after.reviewerNotes).toBe("Mejor esperemos al festival");
    });

    it("will not request changes without usable notes", async () => {
      const post = await makePost({ status: "submitted" });
      currentProfile.value = ADMIN;

      await expect(
        actions.requestChanges(post.id, { notes: "corto" }),
      ).resolves.toMatchObject({ success: false });
      expect((await read(post.id)).status).toBe("submitted");
    });

    it("rejects a submitted post", async () => {
      const post = await makePost({ status: "submitted" });
      currentProfile.value = ADMIN;

      await expect(
        actions.rejectPost(post.id, { notes: "No encaja con el blog" }),
      ).resolves.toMatchObject({ success: true });

      expect((await read(post.id)).status).toBe("rejected");
    });
  });

  describe("archive and restore", () => {
    it("archives a published post and restores it", async () => {
      const post = await makePost({
        status: "published",
        publishedAt: new Date(),
      });
      currentProfile.value = ADMIN;

      await expect(actions.archivePost(post.id)).resolves.toMatchObject({
        success: true,
      });
      expect((await read(post.id)).status).toBe("archived");

      await expect(actions.restorePost(post.id)).resolves.toMatchObject({
        success: true,
      });
      expect((await read(post.id)).status).toBe("published");
    });

    it("refuses to archive something that is not published", async () => {
      const post = await makePost({ status: "draft" });
      currentProfile.value = ADMIN;

      await expect(actions.archivePost(post.id)).resolves.toMatchObject({
        success: false,
      });
    });
  });

  /**
   * A published post is never edited in place. Edits land in the `working_*`
   * columns and only reach the live row once an admin approves them, so the
   * public article never shows an unreviewed change.
   */
  describe("working copy on a published post", () => {
    async function publishedPost() {
      return makePost({
        status: "published",
        publishedAt: new Date(),
        title: "Título publicado",
        content: DOC("Cuerpo publicado."),
        contentHtml: "<p>Cuerpo publicado.</p>",
      });
    }

    it("stages an autosave instead of touching the live row", async () => {
      const post = await publishedPost();

      await expect(
        actions.autosaveDraft(post.id, {
          title: "Título editado",
          content: DOC("Cuerpo editado."),
          categoryIds: [],
          tagInputs: [],
        }),
      ).resolves.toMatchObject({ success: true });

      const after = await read(post.id);
      expect(after.title).toBe("Título publicado");
      expect(after.contentHtml).toBe("<p>Cuerpo publicado.</p>");
      expect(after.workingTitle).toBe("Título editado");
      expect(after.workingUpdatedAt).toBeInstanceOf(Date);
      // Derived server-side from the staged blocks, like the live column.
      expect(after.workingContentHtml).toContain("Cuerpo editado.");
    });

    it("sends staged changes to review without changing the public status", async () => {
      const post = await publishedPost();
      await actions.autosaveDraft(post.id, {
        title: "Título editado",
        content: DOC("Cuerpo editado."),
        categoryIds: [],
        tagInputs: [],
      });

      await expect(actions.submitForReview(post.id)).resolves.toMatchObject({
        success: true,
      });

      const after = await read(post.id);
      expect(after.status).toBe("published");
      expect(after.workingSubmittedAt).toBeInstanceOf(Date);
      expect(after.workingReviewerNotes).toBeNull();
    });

    it("refuses to submit when nothing is staged", async () => {
      const post = await publishedPost();

      await expect(actions.submitForReview(post.id)).resolves.toMatchObject({
        success: false,
      });
    });

    it("merges the staged copy into the live row on approval and clears staging", async () => {
      const post = await publishedPost();
      await actions.autosaveDraft(post.id, {
        title: "Título editado",
        content: DOC("Cuerpo editado."),
        categoryIds: [],
        tagInputs: [],
      });
      await actions.submitForReview(post.id);

      currentProfile.value = ADMIN;
      await expect(actions.approvePost(post.id)).resolves.toMatchObject({
        success: true,
      });

      const after = await read(post.id);
      expect(after.status).toBe("published");
      expect(after.title).toBe("Título editado");
      expect(after.contentHtml).toContain("Cuerpo editado.");
      expect(after.workingTitle).toBeNull();
      expect(after.workingContent).toBeNull();
      expect(after.workingUpdatedAt).toBeNull();
      expect(after.workingSubmittedAt).toBeNull();
    });

    it("keeps the post published while asking the author for changes", async () => {
      const post = await publishedPost();
      await actions.autosaveDraft(post.id, {
        title: "Título editado",
        content: DOC("Cuerpo editado."),
        categoryIds: [],
        tagInputs: [],
      });
      await actions.submitForReview(post.id);

      currentProfile.value = ADMIN;
      await expect(
        actions.requestChanges(post.id, { notes: "Cambiá el cierre" }),
      ).resolves.toMatchObject({ success: true });

      const after = await read(post.id);
      expect(after.status).toBe("published");
      expect(after.title).toBe("Título publicado");
      expect(after.workingReviewerNotes).toBe("Cambiá el cierre");
      expect(after.workingTitle).toBe("Título editado");
    });

    /**
     * The reviewer has to be able to correct their own note. While
     * `stagedPendingReview` also required no notes yet, a second call fell
     * through to the status check and was refused as "not in review" — on a
     * post that is published, with the author yet to touch it.
     */
    it("lets a reviewer amend notes on the same staged copy", async () => {
      const post = await publishedPost();
      await actions.autosaveDraft(post.id, {
        title: "Título editado",
        content: DOC("Cuerpo editado."),
        categoryIds: [],
        tagInputs: [],
      });
      await actions.submitForReview(post.id);

      currentProfile.value = ADMIN;
      await actions.requestChanges(post.id, { notes: "Cambiá el cierre" });

      await expect(
        actions.requestChanges(post.id, {
          notes: "Cambiá el cierre y la portada",
        }),
      ).resolves.toMatchObject({ success: true });

      const after = await read(post.id);
      expect(after.workingReviewerNotes).toBe("Cambiá el cierre y la portada");
      // Still staged, still live: amending a note is not a status change.
      expect(after.status).toBe("published");
      expect(after.workingTitle).toBe("Título editado");
    });

    it("throws the staged copy away on discard, leaving the live row alone", async () => {
      const post = await publishedPost();
      await actions.autosaveDraft(post.id, {
        title: "Título editado",
        content: DOC("Cuerpo editado."),
        categoryIds: [],
        tagInputs: [],
      });

      await expect(actions.discardWorkingCopy(post.id)).resolves.toMatchObject({
        success: true,
      });

      const after = await read(post.id);
      expect(after.title).toBe("Título publicado");
      expect(after.workingTitle).toBeNull();
      expect(after.workingUpdatedAt).toBeNull();
    });
  });

  describe("ensureUniquePostSlug", () => {
    it("returns the base slug when nothing holds it", async () => {
      const base = `libre-${Date.now()}`;

      await expect(
        ensureUniquePostSlug(integrationDb! as never, base),
      ).resolves.toBe(base);
    });

    it("suffixes -2 then -3 as each collision is taken", async () => {
      const base = `choque-${Date.now()}`;
      await makePost({ slug: base });

      await expect(
        ensureUniquePostSlug(integrationDb! as never, base),
      ).resolves.toBe(`${base}-2`);

      await makePost({ slug: `${base}-2` });
      await expect(
        ensureUniquePostSlug(integrationDb! as never, base),
      ).resolves.toBe(`${base}-3`);
    });

    it("lets a post keep its own slug when it is excluded", async () => {
      const base = `propio-${Date.now()}`;
      const post = await makePost({ slug: base });

      await expect(
        ensureUniquePostSlug(integrationDb! as never, base, post.id),
      ).resolves.toBe(base);
      await expect(
        ensureUniquePostSlug(integrationDb! as never, base),
      ).resolves.toBe(`${base}-2`);
    });

    it("falls back to 'articulo' when the base is empty", async () => {
      const slug = await ensureUniquePostSlug(integrationDb! as never, "   ");

      expect(slug === "articulo" || /^articulo-\d+$/.test(slug)).toBe(true);
    });

    it("keeps the suffixed slug inside the column limit", async () => {
      const base = "a".repeat(120);
      await makePost({ slug: base });

      const slug = await ensureUniquePostSlug(integrationDb! as never, base);

      expect(slug).toBe(`${"a".repeat(118)}-2`);
      expect(slug).toHaveLength(120);
    });
  });

  describe("retryingSlugConflict", () => {
    const conflict = () =>
      Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint: "posts_slug_unique",
      });

    it("re-runs the body after a slug conflict and returns the retry's value", async () => {
      const { retryingSlugConflict } = await import("@/app/lib/posts/slug");
      let calls = 0;

      const result = await retryingSlugConflict(async () => {
        calls++;
        if (calls === 1) throw conflict();
        return "segundo intento";
      });

      expect(calls).toBe(2);
      expect(result).toBe("segundo intento");
    });

    it("gives up rather than looping forever", async () => {
      const { retryingSlugConflict } = await import("@/app/lib/posts/slug");
      let calls = 0;

      await expect(
        retryingSlugConflict(async () => {
          calls++;
          throw conflict();
        }),
      ).rejects.toMatchObject({ code: "23505" });
      expect(calls).toBe(3);
    });

    /** A unique violation on something else is a real failure, not a race. */
    it("rethrows a non-slug unique violation immediately", async () => {
      const { retryingSlugConflict } = await import("@/app/lib/posts/slug");
      let calls = 0;

      await expect(
        retryingSlugConflict(async () => {
          calls++;
          throw Object.assign(new Error("duplicate key"), {
            code: "23505",
            constraint: "post_share_links_token_unique",
          });
        }),
      ).rejects.toMatchObject({ constraint: "post_share_links_token_unique" });
      expect(calls).toBe(1);
    });

    it("rethrows an unrelated error immediately", async () => {
      const { retryingSlugConflict } = await import("@/app/lib/posts/slug");
      let calls = 0;

      await expect(
        retryingSlugConflict(async () => {
          calls++;
          throw new Error("algo más");
        }),
      ).rejects.toThrow("algo más");
      expect(calls).toBe(1);
    });
  });

  /**
   * The `ensureUnique*` helpers ask what is free; a SELECT reserves nothing, so
   * two writers can resolve the same candidate and one loses to the unique
   * index. These cover the two places that actually collide in practice.
   */
  describe("concurrent slug allocation", () => {
    it("creates two blank drafts at once without either failing", async () => {
      const createBlankDraft = (await import("@/app/lib/posts/create-draft"))
        .createBlankDraft;

      const [first, second] = await Promise.all([
        createBlankDraft({ id: AUTHOR.id }),
        createBlankDraft({ id: AUTHOR.id }),
      ]);
      createdPostIds.push(first.id, second.id);

      expect(first.slug).not.toBe(second.slug);
      for (const slug of [first.slug, second.slug]) {
        expect(slug === "borrador" || /^borrador-\d+$/.test(slug)).toBe(true);
      }
    });

    /**
     * The interleaving that used to break a save, forced rather than hoped
     * for: two connections both look and both miss, then the winner commits
     * and the loser inserts into a slug that now exists.
     *
     * `Promise.all` over two `autosaveDraft` calls does *not* reproduce this —
     * verified by running such a test against the old SELECT-then-INSERT code,
     * where it passed. Only explicit transactions pin the ordering.
     */
    it("survives the exact interleaving that used to raise 23505", async () => {
      const slug = `carrera-${Date.now()}`;
      const winner = await pool!.connect();
      const loser = await pool!.connect();

      try {
        await winner.query("begin");
        await loser.query("begin");

        // Both look before either writes; neither sees the tag.
        for (const client of [winner, loser]) {
          const seen = await client.query(
            "select id from post_tags where slug = $1",
            [slug],
          );
          expect(seen.rowCount).toBe(0);
        }

        const won = await winner.query(
          "insert into post_tags (name, slug) values ($1, $2) on conflict (slug) do nothing returning id",
          [slug, slug],
        );
        expect(won.rowCount).toBe(1);
        await winner.query("commit");

        // The loser's insert now collides. `DO NOTHING` yields no row instead
        // of raising, which is the signal to read the winner's.
        const lost = await loser.query(
          "insert into post_tags (name, slug) values ($1, $2) on conflict (slug) do nothing returning id",
          [slug, slug],
        );
        expect(lost.rowCount).toBe(0);

        const found = await loser.query(
          "select id from post_tags where slug = $1",
          [slug],
        );
        expect(found.rowCount).toBe(1);
        expect(found.rows[0].id).toBe(won.rows[0].id);
        await loser.query("commit");
      } finally {
        winner.release();
        loser.release();
      }
    });

    /** The same interleaving without `ON CONFLICT` — this is what used to happen. */
    it("a bare insert in that position raises a unique violation", async () => {
      const slug = `carrera-cruda-${Date.now()}`;
      const winner = await pool!.connect();
      const loser = await pool!.connect();

      try {
        await winner.query(
          "insert into post_tags (name, slug) values ($1, $2)",
          [slug, slug],
        );

        await expect(
          loser.query("insert into post_tags (name, slug) values ($1, $2)", [
            slug,
            slug,
          ]),
        ).rejects.toMatchObject({ code: "23505" });
      } finally {
        winner.release();
        loser.release();
      }
    });

    it("lets two posts introduce the same new tag simultaneously", async () => {
      const tag = `etiqueta-${Date.now()}`;
      const first = await makePost();
      const second = await makePost();

      const results = await Promise.all([
        actions.autosaveDraft(first.id, {
          title: "Primero",
          content: DOC("Uno."),
          categoryIds: [],
          tagInputs: [tag],
        }),
        actions.autosaveDraft(second.id, {
          title: "Segundo",
          content: DOC("Dos."),
          categoryIds: [],
          tagInputs: [tag],
        }),
      ]);

      for (const result of results) {
        expect(result).toMatchObject({ success: true });
      }

      // One tag, shared — not two rows and not a suffixed duplicate.
      const rows = await integrationDb!
        .select({ id: schema.postTags.id, slug: schema.postTags.slug })
        .from(schema.postTags)
        .where(eq(schema.postTags.slug, tag));
      expect(rows).toHaveLength(1);

      const links = await integrationDb!
        .select({ postId: schema.postTagsToPosts.postId })
        .from(schema.postTagsToPosts)
        .where(eq(schema.postTagsToPosts.tagId, rows[0].id));
      expect(links.map((l) => l.postId).sort()).toEqual(
        [first.id, second.id].sort(),
      );
    });
  });

  describe("status invariants", () => {
    const NON_SUBMITTED: PostStatus[] = ["draft", "published", "archived"];

    it("only accepts review decisions on something actually in review", async () => {
      currentProfile.value = ADMIN;

      for (const status of NON_SUBMITTED) {
        const post = await makePost({
          status,
          publishedAt: status === "published" ? new Date() : null,
        });

        await expect(
          actions.rejectPost(post.id, { notes: "No encaja con el blog" }),
        ).resolves.toMatchObject({ success: false });
        expect((await read(post.id)).status).toBe(status);
      }
    });
  });

  /**
   * Regression. The queue matched only `status = 'submitted'`, so an edit
   * staged on an already-published article and sent for review never appeared
   * anywhere an admin looks — the author submitted into silence. Every action
   * involved worked; only the screen that surfaces the work was blind, which
   * is why nothing below the UI caught it.
   */
  describe("review queue contents", () => {
    it("lists a submitted draft", async () => {
      const post = await makePost({ status: "submitted" });

      const queue = await fetchSubmittedPostsForReview();

      expect(queue.map((p) => p.id)).toContain(post.id);
    });

    it("lists a published post whose staged edit is awaiting review", async () => {
      const post = await makePost({
        status: "published",
        publishedAt: new Date(),
        workingTitle: "Título editado",
        workingUpdatedAt: new Date(),
        workingSubmittedAt: new Date(),
      });

      const queue = await fetchSubmittedPostsForReview();

      expect(queue.map((p) => p.id)).toContain(post.id);
    });

    it("drops a staged edit once the reviewer has answered it", async () => {
      const post = await makePost({
        status: "published",
        publishedAt: new Date(),
        workingTitle: "Título editado",
        workingUpdatedAt: new Date(),
        workingSubmittedAt: new Date(),
        workingReviewerNotes: "Cambiá el cierre",
      });

      const queue = await fetchSubmittedPostsForReview();

      expect(queue.map((p) => p.id)).not.toContain(post.id);
    });

    it("ignores a staged edit the author has not submitted yet", async () => {
      const post = await makePost({
        status: "published",
        publishedAt: new Date(),
        workingTitle: "Borrador de cambios",
        workingUpdatedAt: new Date(),
      });

      const queue = await fetchSubmittedPostsForReview();

      expect(queue.map((p) => p.id)).not.toContain(post.id);
    });

    it("ignores a plain published post", async () => {
      const post = await makePost({
        status: "published",
        publishedAt: new Date(),
      });

      const queue = await fetchSubmittedPostsForReview();

      expect(queue.map((p) => p.id)).not.toContain(post.id);
    });
  });
});
