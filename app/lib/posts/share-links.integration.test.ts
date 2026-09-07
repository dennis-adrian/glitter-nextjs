// @vitest-environment node

import { and, eq, inArray, isNull } from "drizzle-orm";
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

import type { PostAudience, PostStatus } from "@/app/lib/posts/definitions";
import * as schema from "@/db/schema";
import { postShareLinks, posts, users } from "@/db/schema";

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

let actions: typeof import("@/app/lib/posts/share-actions");
let shareLinks: typeof import("@/app/lib/posts/share-links");

let AUTHOR: { id: number; role: string; status: string };
let STRANGER: { id: number; role: string; status: string };
let ADMIN: { id: number; role: string; status: string };

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];
let counter = 0;

async function makePost(
  status: PostStatus = "draft",
  audience: PostAudience = "public",
) {
  counter += 1;
  const [row] = await integrationDb!
    .insert(posts)
    .values({
      title: "Borrador para compartir",
      slug: `share-${Date.now()}-${counter}`,
      content: [{ type: "paragraph", content: [] }],
      contentHtml: "<p>secreto</p>",
      authorId: AUTHOR.id,
      status,
      publishedAt: status === "published" ? new Date() : null,
      audience,
    })
    .returning({ id: posts.id });
  createdPostIds.push(row.id);
  return row.id;
}

function tokenFrom(url: string): string {
  return url.split("/").pop()!;
}

async function createOk(postId: number, expiresAt?: unknown) {
  const result = await actions.createShareLink(postId, expiresAt);
  if (!result.success) throw new Error(`create failed: ${result.message}`);
  return result.link;
}

describeDatabase("blog share links", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    dbHolder.current = integrationDb as never;

    const probe = await pool!.query<{ table: string | null }>(
      "select to_regclass('public.post_share_links')::text as table",
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
          clerkId: `s-author-${suffix}`,
          email: `s-author-${suffix}@example.test`,
          status: "verified",
        },
        {
          clerkId: `s-stranger-${suffix}`,
          email: `s-stranger-${suffix}@example.test`,
          status: "verified",
        },
        {
          clerkId: `s-admin-${suffix}`,
          email: `s-admin-${suffix}@example.test`,
          role: "admin",
          status: "verified",
        },
      ])
      .returning({ id: users.id });
    createdUserIds.push(...rows.map((r) => r.id));

    AUTHOR = { id: rows[0].id, role: "artist", status: "verified" };
    STRANGER = { id: rows[1].id, role: "artist", status: "verified" };
    ADMIN = { id: rows[2].id, role: "admin", status: "verified" };

    actions = await import("@/app/lib/posts/share-actions");
    shareLinks = await import("@/app/lib/posts/share-links");
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

  /**
   * The whole point of the feature: a post nobody can reach through the blog
   * is readable by whoever holds the link.
   */
  it("opens an unpublished draft that the public routes would refuse", async () => {
    const postId = await makePost("draft");
    const link = await createOk(postId);

    const post = await shareLinks.resolveSharedPost(tokenFrom(link.url));

    expect(post?.id).toBe(postId);
    expect(post?.status).toBe("draft");
    expect(post?.contentHtml).toContain("secreto");
  });

  /**
   * A share link is an explicit act by someone who can edit the post, so it
   * outranks the audience gate the same way it outranks `status`.
   */
  it("opens a participants-only post without a session", async () => {
    const postId = await makePost("published", "participants");
    const link = await createOk(postId);

    currentProfile.value = null;
    const post = await shareLinks.resolveSharedPost(tokenFrom(link.url));

    expect(post?.id).toBe(postId);
    expect(post?.audience).toBe("participants");
  });

  it("refuses a token that was never issued", async () => {
    await expect(
      shareLinks.resolveSharedPost("f".repeat(64)),
    ).resolves.toBeNull();
  });

  it("refuses a malformed token without querying", async () => {
    for (const bad of ["", "abc", "../../etc/passwd", "Z".repeat(64)]) {
      await expect(shareLinks.resolveSharedPost(bad)).resolves.toBeNull();
    }
  });

  describe("re-sharing", () => {
    /**
     * The reason the token is stored as issued rather than hashed: an author
     * who wants to send the link to one more person a month later must get
     * the same URL back, not a new one that breaks the first recipients.
     */
    it("hands back the same link on a later visit", async () => {
      const postId = await makePost();
      const first = await createOk(postId);

      const reloaded = await shareLinks.fetchLiveShareLink(postId);

      expect(reloaded?.url).toBe(first.url);
      expect(reloaded?.id).toBe(first.id);
    });

    it("asking to create twice does not mint a second link", async () => {
      const postId = await makePost();
      const first = await createOk(postId);
      const second = await createOk(postId);

      expect(second.url).toBe(first.url);
      await expect(
        shareLinks.resolveSharedPost(tokenFrom(first.url)),
      ).resolves.not.toBeNull();
    });

    it("stores the token as issued, so the URL is reconstructible", async () => {
      const postId = await makePost();
      const link = await createOk(postId);

      const [row] = await integrationDb!
        .select({ token: postShareLinks.token })
        .from(postShareLinks)
        .where(eq(postShareLinks.postId, postId));

      expect(row.token).toBe(tokenFrom(link.url));
    });
  });

  it("stops working once revoked", async () => {
    const postId = await makePost();
    const link = await createOk(postId);
    const token = tokenFrom(link.url);

    await expect(shareLinks.resolveSharedPost(token)).resolves.not.toBeNull();

    await expect(actions.revokeShareLink(postId)).resolves.toMatchObject({
      success: true,
    });

    await expect(shareLinks.resolveSharedPost(token)).resolves.toBeNull();
  });

  it("revoking twice succeeds — the caller gets the state they asked for", async () => {
    const postId = await makePost();
    await createOk(postId);

    await expect(actions.revokeShareLink(postId)).resolves.toMatchObject({
      success: true,
    });
    await expect(actions.revokeShareLink(postId)).resolves.toMatchObject({
      success: true,
    });
  });

  it("generates a fresh link after a revocation", async () => {
    const postId = await makePost();
    const first = await createOk(postId);
    await actions.revokeShareLink(postId);

    const second = await createOk(postId);

    expect(second.url).not.toBe(first.url);
    await expect(
      shareLinks.resolveSharedPost(tokenFrom(first.url)),
    ).resolves.toBeNull();
    await expect(
      shareLinks.resolveSharedPost(tokenFrom(second.url)),
    ).resolves.not.toBeNull();
  });

  describe("expiry", () => {
    it("keeps working when no expiry was set", async () => {
      const postId = await makePost();
      const link = await createOk(postId, null);

      expect(link.expiresAt).toBeNull();
      await expect(
        shareLinks.resolveSharedPost(tokenFrom(link.url)),
      ).resolves.not.toBeNull();
    });

    it("works before the expiry and not after it", async () => {
      const postId = await makePost();
      const future = new Date(Date.now() + 60 * 60 * 1000);
      const link = await createOk(postId, future);
      const token = tokenFrom(link.url);

      await expect(shareLinks.resolveSharedPost(token)).resolves.not.toBeNull();

      // Move the boundary into the past rather than waiting for the clock.
      await integrationDb!
        .update(postShareLinks)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(postShareLinks.postId, postId));

      await expect(shareLinks.resolveSharedPost(token)).resolves.toBeNull();
    });

    it("refuses an expiry in the past instead of minting a dead link", async () => {
      const postId = await makePost();
      const past = new Date(Date.now() - 10 * 60 * 1000);

      await expect(
        actions.createShareLink(postId, past),
      ).resolves.toMatchObject({ success: false });
    });

    /**
     * Changing when a link dies must not change the link — that is the whole
     * difference between an expiry edit and a regeneration.
     */
    it("updates the expiry without changing the URL", async () => {
      const postId = await makePost();
      const link = await createOk(postId);
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const result = await actions.updateShareLinkExpiry(postId, future);

      expect(result.success && result.link.url).toBe(link.url);
      expect(result.success && result.link.expiresAt).not.toBeNull();
    });

    it("clears an expiry so the link becomes permanent again", async () => {
      const postId = await makePost();
      await createOk(postId, new Date(Date.now() + 60 * 60 * 1000));

      const result = await actions.updateShareLinkExpiry(postId, null);

      expect(result.success && result.link.expiresAt).toBeNull();
    });

    it("revives an expired link when the date is pushed out", async () => {
      const postId = await makePost();
      const link = await createOk(postId);
      const token = tokenFrom(link.url);
      await integrationDb!
        .update(postShareLinks)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(postShareLinks.postId, postId));
      await expect(shareLinks.resolveSharedPost(token)).resolves.toBeNull();

      await actions.updateShareLinkExpiry(
        postId,
        new Date(Date.now() + 60 * 60 * 1000),
      );

      await expect(shareLinks.resolveSharedPost(token)).resolves.not.toBeNull();
    });

    it("refuses an expiry edit when there is no link", async () => {
      const postId = await makePost();

      await expect(
        actions.updateShareLinkExpiry(postId, null),
      ).resolves.toMatchObject({ success: false });
    });

    it("reports an expired link as expired to the editor", async () => {
      const postId = await makePost();
      await createOk(postId);
      await integrationDb!
        .update(postShareLinks)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(postShareLinks.postId, postId));

      const summary = await shareLinks.fetchLiveShareLink(postId);

      expect(summary?.isExpired).toBe(true);
    });
  });

  describe("regeneration", () => {
    it("kills the previous link and leaves exactly one live row", async () => {
      const postId = await makePost();
      const first = tokenFrom((await createOk(postId)).url);

      const result = await actions.regenerateShareLink(postId);
      const second = result.success ? tokenFrom(result.link.url) : "";

      expect(second).not.toBe(first);
      await expect(shareLinks.resolveSharedPost(first)).resolves.toBeNull();
      await expect(shareLinks.resolveSharedPost(second)).resolves.not.toBeNull();

      const live = await integrationDb!
        .select({ id: postShareLinks.id })
        .from(postShareLinks)
        .where(
          and(
            eq(postShareLinks.postId, postId),
            isNull(postShareLinks.revokedAt),
          ),
        );
      expect(live).toHaveLength(1);
    });

    /**
     * Regenerating replaces a leaked address; it is not a place to restate the
     * terms, so the expiry the author already chose carries over.
     */
    it("carries the expiry over to the new link", async () => {
      const postId = await makePost();
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await createOk(postId, future);

      const result = await actions.regenerateShareLink(postId);

      expect(result.success && result.link.expiresAt).not.toBeNull();
    });
  });

  describe("authorization", () => {
    it("refuses someone who cannot edit the post", async () => {
      const postId = await makePost();
      currentProfile.value = STRANGER;

      await expect(actions.createShareLink(postId)).resolves.toMatchObject({
        success: false,
      });
      await expect(actions.revokeShareLink(postId)).resolves.toMatchObject({
        success: false,
      });
      await expect(
        actions.updateShareLinkExpiry(postId, null),
      ).resolves.toMatchObject({ success: false });
      await expect(actions.regenerateShareLink(postId)).resolves.toMatchObject({
        success: false,
      });
    });

    it("refuses an anonymous caller", async () => {
      const postId = await makePost();
      currentProfile.value = null;

      await expect(actions.createShareLink(postId)).resolves.toMatchObject({
        success: false,
      });
    });

    it("lets staff share someone else's post, like the editor does", async () => {
      const postId = await makePost();
      currentProfile.value = ADMIN;

      const link = await createOk(postId);
      await expect(
        shareLinks.resolveSharedPost(tokenFrom(link.url)),
      ).resolves.not.toBeNull();
    });

    it("refuses a post that does not exist", async () => {
      await expect(actions.createShareLink(-1)).resolves.toMatchObject({
        success: false,
      });
    });
  });

  /**
   * Archiving is how an article is retired. A link minted while it was live
   * must not survive that.
   */
  it("stops resolving once the post is archived", async () => {
    const postId = await makePost("published");
    const link = await createOk(postId);
    const token = tokenFrom(link.url);

    await integrationDb!
      .update(posts)
      .set({ status: "archived" })
      .where(eq(posts.id, postId));

    await expect(shareLinks.resolveSharedPost(token)).resolves.toBeNull();
  });

  it("goes away with the post", async () => {
    const postId = await makePost();
    const link = await createOk(postId);

    await integrationDb!.delete(posts).where(eq(posts.id, postId));

    await expect(
      shareLinks.resolveSharedPost(tokenFrom(link.url)),
    ).resolves.toBeNull();
    const rows = await integrationDb!
      .select({ id: postShareLinks.id })
      .from(postShareLinks)
      .where(eq(postShareLinks.postId, postId));
    expect(rows).toHaveLength(0);
  });
});
