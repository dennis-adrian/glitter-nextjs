import { describe, expect, it } from "vitest";

import {
  redactEventProperties,
  redactSensitiveUrlParams,
} from "@/app/lib/posthog-redaction";

describe("redactSensitiveUrlParams", () => {
  it("redacts a purchase access token", () => {
    expect(
      redactSensitiveUrlParams(
        "https://www.productoraglitter.com/programs/purchases/12?token=abc123",
      ),
    ).toBe(
      "https://www.productoraglitter.com/programs/purchases/12?token=redacted",
    );
  });

  it("keeps the rest of the query string", () => {
    expect(
      redactSensitiveUrlParams(
        "https://example.com/p?utm_source=ig&token=abc123&ref=story",
      ),
    ).toBe("https://example.com/p?utm_source=ig&token=redacted&ref=story");
  });

  it("stops at the fragment", () => {
    expect(redactSensitiveUrlParams("/purchases/1?token=abc#horarios")).toBe(
      "/purchases/1?token=redacted#horarios",
    );
  });

  it("leaves unrelated params alone", () => {
    const url = "https://example.com/programs?slug=glitter-week";
    expect(redactSensitiveUrlParams(url)).toBe(url);
  });

  /** `tokenId` shares a prefix but is not the credential. */
  it("does not match a param that merely starts with the same letters", () => {
    const url = "https://example.com/p?tokenId=7";
    expect(redactSensitiveUrlParams(url)).toBe(url);
  });
});

describe("redactEventProperties", () => {
  it("redacts every url-bearing property", () => {
    expect(
      redactEventProperties({
        $current_url: "https://example.com/purchases/1?token=abc",
        $referrer: "https://example.com/purchases/1?token=abc",
        purchase_id: 1,
      }),
    ).toEqual({
      $current_url: "https://example.com/purchases/1?token=redacted",
      $referrer: "https://example.com/purchases/1?token=redacted",
      purchase_id: 1,
    });
  });

  it("returns the same object when there is nothing to redact", () => {
    const properties = { $current_url: "https://example.com/programs" };
    expect(redactEventProperties(properties)).toBe(properties);
  });

  it("passes non-string values through", () => {
    expect(
      redactEventProperties({ seats_remaining: 4, sold_out: false }),
    ).toEqual({ seats_remaining: 4, sold_out: false });
  });
});
