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
    ({ ensureUniquePostSlug } = await import("@/app/lib/posts/slug"));
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

    it("replaces a placeholder slug on the way out of draft", async () => {
      const post = await makePost({
        slug: "borrador-99",
        title: "Guía de luz",
      });

      await actions.submitForReview(post.id);

      expect((await read(post.id)).slug).toBe("guia-de-luz");
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
});
