// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  invitationIdempotencyKey,
  isDeliverableEmail,
  partitionRecipients,
} from "@/app/lib/festivals/invitation-helpers";

describe("isDeliverableEmail", () => {
  it.each(["ana@example.com", "a.b+tag@sub.example.bo", " ana@example.com "])(
    "accepts %s",
    (email) => {
      expect(isDeliverableEmail(email)).toBe(true);
    },
  );

  it.each([
    "",
    null,
    undefined,
    "sin-arroba.example.com",
    "espacio en@example.com",
    "dos@@example.com",
    "ana@localhost",
    "Ana <ana@example.com>",
    "ana@example.com, beto@example.com",
  ])("rejects %s", (email) => {
    expect(isDeliverableEmail(email)).toBe(false);
  });
});

describe("partitionRecipients", () => {
  it("drops undeliverable addresses and repeats, keeping the first copy", () => {
    const { valid, skipped } = partitionRecipients([
      { id: 1, email: "ana@example.com" },
      { id: 2, email: "roto" },
      { id: 3, email: "ANA@example.com " },
      { id: 4, email: " beto@example.com" },
    ]);

    expect(valid).toEqual([
      { id: 1, email: "ana@example.com" },
      { id: 4, email: "beto@example.com" },
    ]);
    expect(skipped).toBe(2);
  });

  it("keeps the rest of each row", () => {
    const { valid } = partitionRecipients([
      { id: 7, email: "ana@example.com", firstName: "Ana" },
    ]);
    expect(valid[0]).toEqual({
      id: 7,
      email: "ana@example.com",
      firstName: "Ana",
    });
  });
});

describe("invitationIdempotencyKey", () => {
  const base = {
    kind: "visitor_registration" as const,
    festivalId: 3,
    runId: "6f0c6c1e-8f64-4a8e-9a54-3b1f0c3f2a11",
    recipientIds: [1, 2, 3],
  };

  it("is stable for the same page of the same run, so a retry is deduplicated", () => {
    expect(invitationIdempotencyKey(base)).toBe(
      invitationIdempotencyKey({ ...base, recipientIds: [1, 2, 3] }),
    );
  });

  it("differs for another run, so a deliberate re-send is not swallowed", () => {
    expect(invitationIdempotencyKey(base)).not.toBe(
      invitationIdempotencyKey({
        ...base,
        runId: "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
      }),
    );
  });

  it("differs when the page holds other recipients", () => {
    expect(invitationIdempotencyKey(base)).not.toBe(
      invitationIdempotencyKey({ ...base, recipientIds: [1, 2, 4] }),
    );
  });

  it("differs per festival and mailing, and fits Resend's 256-character limit", () => {
    const key = invitationIdempotencyKey(base);
    expect(key).not.toBe(invitationIdempotencyKey({ ...base, festivalId: 4 }));
    expect(key).not.toBe(
      invitationIdempotencyKey({ ...base, kind: "participant_activation" }),
    );
    expect(key.length).toBeLessThanOrEqual(256);
  });
});
