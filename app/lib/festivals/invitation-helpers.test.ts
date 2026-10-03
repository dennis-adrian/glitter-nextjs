// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  invitationIdempotencyKey,
  isDeliverableEmail,
  partitionRecipients,
  resendOutcome,
  safeGreetingName,
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
    cursor: 0,
    throughId: 140,
    attempt: 0,
  };

  it("names a page by its bounds, so a retry keeps its key when recipients change", () => {
    expect(invitationIdempotencyKey(base)).toBe(
      invitationIdempotencyKey({ ...base }),
    );
  });

  it("changes with the attempt, the run, the page, the festival and the mailing", () => {
    const key = invitationIdempotencyKey(base);
    for (const change of [
      { attempt: 1 },
      { runId: "1b4e28ba-2fa1-41d2-883f-0016d3cca427" },
      { cursor: 140, throughId: 260 },
      { festivalId: 4 },
      { kind: "participant_activation" as const },
    ]) {
      expect(invitationIdempotencyKey({ ...base, ...change })).not.toBe(key);
    }
  });

  it("fits Resend's 256-character limit", () => {
    expect(
      invitationIdempotencyKey({
        ...base,
        kind: "participant_activation",
        festivalId: 2_147_483_647,
        cursor: 2_147_483_647,
        throughId: 2_147_483_647,
        attempt: 50,
      }).length,
    ).toBeLessThanOrEqual(256);
  });
});

describe("resendOutcome", () => {
  it("treats no error, and a key already used with another body, as sent", () => {
    expect(resendOutcome(null)).toBe("sent");
    expect(resendOutcome({ name: "invalid_idempotent_request" })).toBe("sent");
  });

  it("keeps the key when Resend may have taken the batch", () => {
    for (const name of [
      "application_error",
      "internal_server_error",
      "concurrent_idempotent_requests",
    ]) {
      expect(resendOutcome({ name })).toBe("unknown");
    }
  });

  it("moves to a new key when Resend refused the batch", () => {
    for (const name of ["validation_error", "rate_limit_exceeded", undefined]) {
      expect(resendOutcome({ name })).toBe("refused");
    }
  });
});

describe("safeGreetingName", () => {
  it.each([
    ["Camila", "Camila"],
    ["  María José  ", "María José"],
    ["O'Brien", "O'Brien"],
    ["Ana-Lucía", "Ana-Lucía"],
  ])("keeps the name %j", (input, expected) => {
    expect(safeGreetingName(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "visita evil.com",
    "https://evil.example",
    "<b>Ana</b>",
    "Ana, tu entrada fue anulada: escribe a soporte",
    "1234",
    "a".repeat(41),
  ])("leaves out %j", (input) => {
    expect(safeGreetingName(input)).toBeNull();
  });
});
