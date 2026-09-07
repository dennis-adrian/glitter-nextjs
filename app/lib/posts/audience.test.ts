import { describe, expect, it } from "vitest";

import {
  canReadPost,
  isPostGatedFor,
  withGateApplied,
  type PostViewer,
} from "@/app/lib/posts/audience";

const PUBLIC = { audience: "public" as const };
const GATED = { audience: "participants" as const };

const anonymous: PostViewer = null;
const verified = { id: 1, role: "artist", status: "verified" } as PostViewer;
const pending = { id: 2, role: "artist", status: "pending" } as PostViewer;
const paused = { id: 3, role: "artist", status: "paused" } as PostViewer;
const banned = { id: 4, role: "artist", status: "banned" } as PostViewer;
const admin = { id: 5, role: "admin", status: "pending" } as PostViewer;
const festivalAdmin = {
  id: 6,
  role: "festival_admin",
  status: "pending",
} as PostViewer;

describe("canReadPost", () => {
  it("lets everyone read a public post", () => {
    for (const viewer of [anonymous, verified, pending, paused, banned]) {
      expect(canReadPost(viewer, PUBLIC)).toBe(true);
    }
  });

  it("admits verified participants to a restricted post", () => {
    expect(canReadPost(verified, GATED)).toBe(true);
  });

  it("keeps out a signed-out visitor", () => {
    expect(canReadPost(anonymous, GATED)).toBe(false);
  });

  /** `verified` is the whole test — the other statuses are not softer forms of it. */
  it("keeps out pending, paused, and banned profiles", () => {
    expect(canReadPost(pending, GATED)).toBe(false);
    expect(canReadPost(paused, GATED)).toBe(false);
    expect(canReadPost(banned, GATED)).toBe(false);
  });

  it("lets both admin tiers through regardless of their own status", () => {
    expect(canReadPost(admin, GATED)).toBe(true);
    expect(canReadPost(festivalAdmin, GATED)).toBe(true);
  });
});

describe("isPostGatedFor", () => {
  it("is the inverse of canReadPost", () => {
    for (const viewer of [anonymous, verified, pending, admin]) {
      for (const post of [PUBLIC, GATED]) {
        expect(isPostGatedFor(viewer, post)).toBe(!canReadPost(viewer, post));
      }
    }
  });
});

describe("withGateApplied", () => {
  const post = { ...GATED, contentHtml: "<p>secreto</p>" };

  it("blanks the body for a viewer without access", () => {
    const result = withGateApplied(anonymous, post);

    expect(result.gated).toBe(true);
    expect(result.contentHtml).toBe("");
  });

  it("passes the body through for a viewer with access", () => {
    const result = withGateApplied(verified, post);

    expect(result.gated).toBe(false);
    expect(result.contentHtml).toBe("<p>secreto</p>");
  });

  /**
   * The body must be gone from the object, not merely unrendered: a server
   * component's props travel to the client, so a "hidden" string would still
   * ship in the payload.
   */
  it("removes the body from the object rather than hiding it", () => {
    const result = withGateApplied(anonymous, post);

    expect(JSON.stringify(result)).not.toContain("secreto");
  });

  it("leaves a public post untouched", () => {
    const open = { ...PUBLIC, contentHtml: "<p>abierto</p>" };

    expect(withGateApplied(anonymous, open).contentHtml).toBe("<p>abierto</p>");
  });
});
