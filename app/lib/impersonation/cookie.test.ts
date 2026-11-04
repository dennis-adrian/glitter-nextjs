import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  clearImpersonationCookie,
  hashImpersonationToken,
  isWellFormedImpersonationToken,
  newImpersonationToken,
  setImpersonationCookie,
} from "@/app/lib/impersonation/cookie";
import { IMPERSONATION_TOKEN_COOKIE } from "@/app/lib/impersonation/definitions";

describe("view tokens", () => {
  it("are 43 base64url characters, and never repeat", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => newImpersonationToken()),
    );
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(isWellFormedImpersonationToken(token)).toBe(true);
    }
  });

  it("are stored as their SHA-256, never as themselves", () => {
    const token = newImpersonationToken();
    const hash = hashImpersonationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashImpersonationToken(token)).toBe(hash);
    expect(hashImpersonationToken(newImpersonationToken())).not.toBe(hash);
  });

  it.each([
    undefined,
    null,
    "",
    "short",
    `${"a".repeat(42)}=`,
    "a".repeat(44),
    `${"a".repeat(42)}/`,
    12,
  ])("refuses a value that is not one (%s)", (value) => {
    expect(isWellFormedImpersonationToken(value)).toBe(false);
  });
});

describe("the view cookie", () => {
  it("is written httpOnly, for an hour", () => {
    const set = vi.fn();
    setImpersonationCookie({ set }, "token-value");
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      IMPERSONATION_TOKEN_COOKIE,
      "token-value",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 3600,
      }),
    );
  });

  it("is cleared with the attributes it was written with", () => {
    const set = vi.fn();
    clearImpersonationCookie({ set });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      IMPERSONATION_TOKEN_COOKIE,
      "",
      expect.objectContaining({ httpOnly: true, path: "/", maxAge: 0 }),
    );
  });
});
