// @vitest-environment node

import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  suppressionChanges,
  verifyResendWebhook,
} from "@/app/lib/emails/resend-webhook";

/** Svix's own published example, also in its test suite. */
const SVIX = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  timestamp: "1614265330",
  payload: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
  now: 1614265330 * 1000,
};

function sign(secret: string, id: string, timestamp: string, payload: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
}

describe("verifyResendWebhook", () => {
  it("accepts Svix's reference signature", () => {
    expect(verifyResendWebhook(SVIX)).toBe(true);
  });

  it("accepts any v1 entry, as during a secret rotation", () => {
    expect(
      verifyResendWebhook({
        ...SVIX,
        signature: `v1,AAAA v2,whatever ${SVIX.signature}`,
      }),
    ).toBe(true);
  });

  it("refuses an edited body, another id, or another secret", () => {
    expect(verifyResendWebhook({ ...SVIX, payload: '{"test": 1}' })).toBe(
      false,
    );
    expect(verifyResendWebhook({ ...SVIX, id: "msg_other" })).toBe(false);
    expect(
      verifyResendWebhook({
        ...SVIX,
        secret: "whsec_" + Buffer.from("another secret").toString("base64"),
      }),
    ).toBe(false);
  });

  it("refuses a timestamp more than five minutes off, either way", () => {
    expect(
      verifyResendWebhook({ ...SVIX, now: SVIX.now + 5 * 60 * 1000 }),
    ).toBe(true);
    expect(
      verifyResendWebhook({ ...SVIX, now: SVIX.now + 5 * 60 * 1000 + 1000 }),
    ).toBe(false);
    expect(
      verifyResendWebhook({ ...SVIX, now: SVIX.now - 5 * 60 * 1000 - 1000 }),
    ).toBe(false);
  });

  it("refuses missing headers, malformed entries and non-v1 versions", () => {
    expect(verifyResendWebhook({ ...SVIX, id: null })).toBe(false);
    expect(verifyResendWebhook({ ...SVIX, timestamp: null })).toBe(false);
    expect(verifyResendWebhook({ ...SVIX, signature: null })).toBe(false);
    expect(verifyResendWebhook({ ...SVIX, timestamp: "1614265330.5" })).toBe(
      false,
    );
    expect(
      verifyResendWebhook({
        ...SVIX,
        signature: SVIX.signature.replace("v1,", "v2,"),
      }),
    ).toBe(false);
    expect(verifyResendWebhook({ ...SVIX, signature: "v1," })).toBe(false);
    expect(verifyResendWebhook({ ...SVIX, secret: "whsec_" })).toBe(false);
  });

  it("verifies what Resend would send now", () => {
    const secret =
      "whsec_" + Buffer.from("glitter test secret").toString("base64");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = JSON.stringify({ type: "email.bounced", data: {} });
    expect(
      verifyResendWebhook({
        payload,
        id: "msg_1",
        timestamp,
        signature: `v1,${sign(secret, "msg_1", timestamp, payload)}`,
        secret,
      }),
    ).toBe(true);
  });
});

describe("suppressionChanges", () => {
  const base = {
    email_id: "em_123",
    from: "Equipo Glitter <equipo@productoraglitter.com>",
    subject: "Pre-registro abierto",
    created_at: "2026-10-04T12:00:00.000Z",
  };

  it("suppresses every impacted recipient of a permanent bounce", () => {
    expect(
      suppressionChanges({
        type: "email.bounced",
        data: {
          ...base,
          to: ["Ana@Example.test"],
          bounce: {
            type: "Permanent",
            subType: "NoEmail",
            message: "The recipient's mailbox does not exist.",
          },
        },
      }),
    ).toEqual([
      {
        action: "suppress",
        address: "Ana@Example.test",
        reason: "bounce",
        resendEmailId: "em_123",
        detail: "NoEmail: The recipient's mailbox does not exist.",
        eventAt: new Date("2026-10-04T12:00:00.000Z"),
      },
    ]);
  });

  it("leaves transient and undetermined bounces alone: the next mailing tries again", () => {
    for (const type of ["Transient", "Undetermined", undefined]) {
      expect(
        suppressionChanges({
          type: "email.bounced",
          data: { ...base, to: ["ana@example.test"], bounce: { type } },
        }),
      ).toEqual([]);
    }
  });

  it("records a spam complaint", () => {
    expect(
      suppressionChanges({
        type: "email.complained",
        data: { ...base, to: ["ana@example.test"] },
      }),
    ).toMatchObject([
      { action: "suppress", address: "ana@example.test", reason: "complaint" },
    ]);
  });

  it("mirrors Resend's own suppressions with their reason", () => {
    expect(
      suppressionChanges({
        type: "email.suppressed",
        data: {
          ...base,
          to: ["a@example.test"],
          suppressed: {
            type: "OnAccountSuppressionList",
            reason: "previous_complaint",
          },
        },
      }),
    ).toMatchObject([{ reason: "complaint" }]);
    expect(
      suppressionChanges({
        type: "email.suppressed",
        data: {
          ...base,
          to: ["a@example.test"],
          suppressed: {
            type: "OnAccountSuppressionList",
            reason: "previous_bounce",
          },
        },
      }),
    ).toMatchObject([{ reason: "bounce" }]);
  });

  it("follows suppressions added or lifted in Resend", () => {
    expect(
      suppressionChanges({
        type: "suppression.added",
        data: {
          id: "s_1",
          email: "a@example.test",
          origin: "complaint",
          source_id: "em_9",
        },
      }),
    ).toMatchObject([
      {
        action: "suppress",
        address: "a@example.test",
        reason: "complaint",
        resendEmailId: "em_9",
      },
    ]);
    expect(
      suppressionChanges({
        type: "suppression.removed",
        data: { id: "s_1", email: "a@example.test", origin: "bounce" },
      }),
    ).toEqual([
      {
        action: "lift",
        address: "a@example.test",
        reason: "bounce",
        eventAt: null,
      },
    ]);
  });

  /** Retries and replays keep the envelope's time; ordering relies on it. */
  it("dates each change by when Resend created the event", () => {
    const [change] = suppressionChanges({
      type: "email.complained",
      created_at: "2026-10-04T15:30:00.000Z",
      data: { ...base, to: ["a@example.test"] },
    });
    expect(change!.eventAt).toEqual(new Date("2026-10-04T15:30:00.000Z"));
    const [undated] = suppressionChanges({
      type: "email.complained",
      created_at: "not a date",
      data: { to: ["a@example.test"] },
    });
    expect(undated!.eventAt).toBeNull();
  });

  it("ignores other events and malformed payloads", () => {
    for (const event of [
      null,
      "email.bounced",
      { type: "email.delivered", data: { ...base, to: ["a@example.test"] } },
      { type: "email.opened", data: { ...base, to: ["a@example.test"] } },
      { type: "email.bounced" },
      { type: "email.complained", data: { ...base, to: [42, "", null] } },
      { type: "suppression.added", data: { origin: "bounce" } },
    ]) {
      expect(suppressionChanges(event)).toEqual([]);
    }
  });
});
