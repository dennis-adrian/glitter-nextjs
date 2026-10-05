// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { unsubscribeLinks } from "@/app/lib/emails/unsubscribe-links";
import { verifyUnsubscribeToken } from "@/app/lib/emails/unsubscribe-tokens";

const env = process.env as Record<string, string | undefined>;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    CLERK_SECRET_KEY: env.CLERK_SECRET_KEY,
    NEXT_PUBLIC_BASE_URL: env.NEXT_PUBLIC_BASE_URL,
  };
  env.CLERK_SECRET_KEY = "sk_test_links";
  env.NEXT_PUBLIC_BASE_URL = "https://www.glitter.com.bo/";
});

afterEach(() => {
  Object.assign(env, saved);
});

describe("unsubscribeLinks", () => {
  it("gives the footer link and RFC 8058 one-click headers for the same person and topic", () => {
    const links = unsubscribeLinks(
      { kind: "visitor", id: 9 },
      "visitor_invitations",
    );

    expect(links.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    const header = links.headers["List-Unsubscribe"];
    expect(header).toMatch(
      /^<https:\/\/www\.glitter\.com\.bo\/api\/email\/unsubscribe\?token=[^>]+>$/,
    );
    expect(links.pageUrl).toMatch(
      /^https:\/\/www\.glitter\.com\.bo\/email\/unsubscribe\?token=/,
    );

    const headerToken = new URL(header.slice(1, -1)).searchParams.get("token");
    const pageToken = new URL(links.pageUrl).searchParams.get("token");
    expect(headerToken).toBe(pageToken);
    expect(verifyUnsubscribeToken(pageToken)).toEqual({
      kind: "visitor",
      id: 9,
      topic: "visitor_invitations",
    });
  });
});
