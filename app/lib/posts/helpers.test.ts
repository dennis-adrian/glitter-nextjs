import { describe, expect, it } from "vitest";

import type { PostStatus } from "@/app/lib/posts/definitions";
import {
  canArchivePost,
  canDeletePost,
  canEditPost,
  canPublishPosts,
  hasMeaningfulContent,
  hasWorking,
  isStaff,
  usesWorkingCopy,
  workingPendingReview,
  workingRejected,
} from "@/app/lib/posts/helpers";

const ALL_STATUSES: PostStatus[] = [
  "draft",
  "submitted",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "archived",
];

const AUTHOR = { id: 7, role: "artist" };
const OTHER = { id: 8, role: "artist" };
const ADMIN = { id: 1, role: "admin" };
const FESTIVAL_ADMIN = { id: 2, role: "festival_admin" };

function post(status: PostStatus, overrides: Record<string, unknown> = {}) {
  return { authorId: AUTHOR.id, status, ...overrides } as never;
}

describe("role predicates", () => {
  it("treats both admin tiers as staff", () => {
    expect(isStaff("admin")).toBe(true);
    expect(isStaff("festival_admin")).toBe(true);
    expect(isStaff("artist")).toBe(false);
    expect(isStaff(null)).toBe(false);
    expect(isStaff(undefined)).toBe(false);
  });

  it("grants publishing to staff only", () => {
    expect(canPublishPosts("admin")).toBe(true);
    expect(canPublishPosts("festival_admin")).toBe(true);
    expect(canPublishPosts("artist")).toBe(false);
  });
});

describe("canEditPost", () => {
  it("locks an archived post to everyone, staff included", () => {
    expect(canEditPost(ADMIN, post("archived"))).toBe(false);
    expect(canEditPost(FESTIVAL_ADMIN, post("archived"))).toBe(false);
    expect(canEditPost(AUTHOR, post("archived"))).toBe(false);
  });

  it("lets staff edit any other post, whoever wrote it", () => {
    for (const status of ALL_STATUSES.filter((s) => s !== "archived")) {
      expect(canEditPost(ADMIN, post(status))).toBe(true);
    }
  });

  it("lets the author edit their own post in every non-archived status", () => {
    for (const status of ALL_STATUSES.filter((s) => s !== "archived")) {
      expect(canEditPost(AUTHOR, post(status))).toBe(true);
    }
  });

  it("never lets one participant edit another's post", () => {
    for (const status of ALL_STATUSES) {
      expect(canEditPost(OTHER, post(status))).toBe(false);
    }
  });
});

describe("canDeletePost", () => {
  it("refuses once a post has been published, even for staff", () => {
    const published = { authorId: AUTHOR.id, publishedAt: new Date() } as never;
    expect(canDeletePost(ADMIN, published)).toBe(false);
    expect(canDeletePost(AUTHOR, published)).toBe(false);
  });

  it("keys off publishedAt, not status — an archived post that once went live stays undeletable", () => {
    const archivedButPublished = {
      authorId: AUTHOR.id,
      publishedAt: new Date(),
    } as never;
    expect(canDeletePost(ADMIN, archivedButPublished)).toBe(false);
  });

  it("lets staff or the author delete something never published", () => {
    const neverPublished = { authorId: AUTHOR.id, publishedAt: null } as never;
    expect(canDeletePost(ADMIN, neverPublished)).toBe(true);
    expect(canDeletePost(AUTHOR, neverPublished)).toBe(true);
    expect(canDeletePost(OTHER, neverPublished)).toBe(false);
  });
});

describe("canArchivePost", () => {
  it("only applies to a published post", () => {
    for (const status of ALL_STATUSES.filter((s) => s !== "published")) {
      expect(canArchivePost(ADMIN, post(status))).toBe(false);
    }
    expect(canArchivePost(ADMIN, post("published"))).toBe(true);
  });

  it("allows the author as well as staff, but nobody else", () => {
    expect(canArchivePost(AUTHOR, post("published"))).toBe(true);
    expect(canArchivePost(OTHER, post("published"))).toBe(false);
  });
});

describe("working-copy state", () => {
  it("stages edits for every status that is out of the author's hands", () => {
    expect(usesWorkingCopy(post("draft"))).toBe(false);
    for (const status of ALL_STATUSES.filter(
      (s) => s !== "draft" && s !== "archived",
    )) {
      expect(usesWorkingCopy(post(status))).toBe(true);
    }
  });

  it("reads presence from workingUpdatedAt alone", () => {
    expect(hasWorking({ workingUpdatedAt: null } as never)).toBe(false);
    expect(hasWorking({ workingUpdatedAt: new Date() } as never)).toBe(true);
  });

  it("counts a staged copy as pending only until a reviewer writes notes", () => {
    const submitted = {
      workingSubmittedAt: new Date(),
      workingReviewerNotes: null,
    } as never;
    expect(workingPendingReview(submitted)).toBe(true);
    expect(workingRejected(submitted)).toBe(false);

    const returned = {
      workingSubmittedAt: new Date(),
      workingReviewerNotes: "Falta la portada",
    } as never;
    expect(workingPendingReview(returned)).toBe(false);
    expect(workingRejected(returned)).toBe(true);
  });

  it("does not treat an unsubmitted staged copy as pending", () => {
    const draftEdit = {
      workingSubmittedAt: null,
      workingReviewerNotes: null,
    } as never;
    expect(workingPendingReview(draftEdit)).toBe(false);
    expect(workingRejected(draftEdit)).toBe(false);
  });
});

describe("hasMeaningfulContent", () => {
  const textBlock = (text: string) => ({
    type: "paragraph",
    content: [{ type: "text", text, styles: {} }],
  });

  it("rejects anything that is not a populated array", () => {
    expect(hasMeaningfulContent(null)).toBe(false);
    expect(hasMeaningfulContent([])).toBe(false);
    expect(hasMeaningfulContent("<p>texto</p>")).toBe(false);
  });

  it("rejects a document of empty or whitespace-only paragraphs", () => {
    expect(hasMeaningfulContent([textBlock("")])).toBe(false);
    expect(hasMeaningfulContent([textBlock("   \n ")])).toBe(false);
    expect(hasMeaningfulContent([{ type: "paragraph", content: [] }])).toBe(
      false,
    );
  });

  it("accepts as soon as any block carries real text", () => {
    expect(hasMeaningfulContent([textBlock(""), textBlock("Hola")])).toBe(true);
  });

  /**
   * Documented, not endorsed. The walk only reads each top-level block's own
   * `content` array, so three shapes an author can legitimately produce all
   * read as empty and block publishing:
   *
   *  - a table, whose `content` is a `{ type, rows }` object, not an array
   *  - an image, which carries its payload in `props` and has no `content`
   *  - text that lives only in a nested child block
   *
   * A table-only or image-only post is a plausible article. Whether these
   * should count is a product call, so these tests pin today's behaviour
   * rather than assume a fix.
   */
  it("treats table-only, image-only, and nested-only documents as empty", () => {
    const table = {
      type: "table",
      content: {
        type: "tableContent",
        rows: [{ cells: [[{ type: "text", text: "Talla", styles: {} }]] }],
      },
    };
    const image = {
      type: "image",
      props: { url: "https://cdn.example.com/a.png", caption: "Pie" },
    };
    const nestedOnly = {
      type: "paragraph",
      content: [],
      children: [textBlock("Texto anidado")],
    };

    expect(hasMeaningfulContent([table])).toBe(false);
    expect(hasMeaningfulContent([image])).toBe(false);
    expect(hasMeaningfulContent([nestedOnly])).toBe(false);
  });
});
