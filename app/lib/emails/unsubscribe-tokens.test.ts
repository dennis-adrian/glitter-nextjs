// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/app/lib/emails/unsubscribe-tokens";

const SUBJECT = {
  kind: "visitor" as const,
  id: 42,
  topic: "visitor_invitations" as const,
};

let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.CLERK_SECRET_KEY;
  process.env.CLERK_SECRET_KEY = "sk_test_unsubscribe";
});

afterEach(() => {
  process.env.CLERK_SECRET_KEY = previousSecret;
});

describe("unsubscribe tokens", () => {
  it("round-trips who and which topic", () => {
    expect(verifyUnsubscribeToken(signUnsubscribeToken(SUBJECT))).toEqual(
      SUBJECT,
    );
    const user = {
      kind: "user" as const,
      id: 7,
      topic: "participant_invitations" as const,
    };
    expect(verifyUnsubscribeToken(signUnsubscribeToken(user))).toEqual(user);
  });

  /** A retried batch must carry the same body to keep its idempotency key. */
  it("is the same every time it is made", () => {
    expect(signUnsubscribeToken(SUBJECT)).toBe(signUnsubscribeToken(SUBJECT));
  });

  it("carries no address", () => {
    const [body] = signUnsubscribeToken(SUBJECT).split(".");
    expect(Buffer.from(body!, "base64url").toString()).not.toContain("@");
  });

  it("refuses a token edited to point at someone else or another topic", () => {
    const [, signature] = signUnsubscribeToken(SUBJECT).split(".");
    for (const payload of [
      { t: "visitor_invitations", r: "v", i: 43 },
      { t: "participant_invitations", r: "v", i: 42 },
      { t: "visitor_invitations", r: "u", i: 42 },
    ]) {
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
      expect(verifyUnsubscribeToken(`${body}.${signature}`)).toBeNull();
    }
  });

  it("refuses a token signed with another key", () => {
    const token = signUnsubscribeToken(SUBJECT);
    process.env.CLERK_SECRET_KEY = "sk_test_rotated";
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it.each([undefined, null, 7, "", "abc", "a.b", "a.b.c", "x".repeat(600)])(
    "refuses malformed input %#",
    (token) => {
      expect(verifyUnsubscribeToken(token)).toBeNull();
    },
  );
});
