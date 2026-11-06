import { describe, expect, it } from "vitest";

import {
  IMPERSONATION_DURATION_SECONDS,
  IMPERSONATION_REFUSAL_MESSAGES,
  IMPERSONATION_REFUSALS,
  IMPERSONATION_SESSION_STATES,
  IMPERSONATION_STATE_LABELS,
  sanitizeImpersonationReturnTo,
} from "@/app/lib/impersonation/definitions";

describe("sanitizeImpersonationReturnTo", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/users/12", "/dashboard/users/12"],
    [
      "/dashboard/users?limit=10&offset=0#lista",
      "/dashboard/users?limit=10&offset=0#lista",
    ],
    ["/dashboard/impersonate", "/dashboard/impersonate"],
  ])("keeps the admin page %s", (input, expected) => {
    expect(sanitizeImpersonationReturnTo(input)).toBe(expected);
  });

  it.each([
    ["another origin", "https://evil.example/dashboard"],
    ["a protocol-relative URL", "//evil.example/dashboard"],
    ["a backslash the browser reads as a slash", "/\\evil.example/dashboard"],
    ["a backslash later in the path", "/dashboard\\..\\sign_in"],
    ["a path that only starts with the letters", "/dashboardx"],
    ["a climb out with ..", "/dashboard/../sign_in"],
    ["an encoded climb", "/dashboard/%2e%2e/sign_in"],
    ["a participant page", "/portal"],
    ["a relative path", "dashboard/users"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a control character", "/dashboard/\nusers"],
    ["an empty string", ""],
    ["a very long value", `/dashboard/${"a".repeat(600)}`],
  ])("drops %s", (_, input) => {
    expect(sanitizeImpersonationReturnTo(input)).toBeNull();
  });

  it.each([undefined, null, 12, {}, ["/dashboard"]])(
    "drops a value that is not a string (%s)",
    (input) => {
      expect(sanitizeImpersonationReturnTo(input)).toBeNull();
    },
  );
});

describe("impersonation constants", () => {
  it("lasts an hour", () => {
    expect(IMPERSONATION_DURATION_SECONDS).toBe(3600);
  });

  it("labels every session state and every refusal", () => {
    for (const state of IMPERSONATION_SESSION_STATES) {
      expect(IMPERSONATION_STATE_LABELS[state]).toBeTruthy();
    }
    for (const refusal of IMPERSONATION_REFUSALS) {
      expect(IMPERSONATION_REFUSAL_MESSAGES[refusal]).toBeTruthy();
    }
  });

  it("never writes a label in all caps", () => {
    const copy = [
      ...Object.values(IMPERSONATION_STATE_LABELS),
      ...Object.values(IMPERSONATION_REFUSAL_MESSAGES),
    ];
    for (const text of copy) {
      expect(text).not.toBe(text.toUpperCase());
    }
  });
});
