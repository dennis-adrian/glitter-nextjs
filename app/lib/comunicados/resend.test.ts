// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ serverEnv: { VERCEL_ENV: "production" } }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdmin: vi.fn() }));

import { byChannels } from "@/app/lib/comunicados/fanout";
import {
  addResendToSummary,
  RESEND_MESSAGES,
  ResendRefusal,
  resendAudienceOf,
} from "@/app/lib/comunicados/resend";

const STORED = { festivals: [3], lists: [8], people: [1, 2] };

describe("resendAudienceOf (G10)", () => {
  it("re-resolves the original sources, with the people picked now added", () => {
    expect(
      resendAudienceOf(STORED, { includeAudience: true, people: [2, 9, 9] }),
    ).toEqual({ festivals: [3], lists: [8], people: [1, 2, 9] });
  });

  it("is only the people picked now without the audience", () => {
    expect(
      resendAudienceOf(STORED, { includeAudience: false, people: [9, 9, 4] }),
    ).toEqual({ festivals: [], lists: [], people: [9, 4] });
  });
});

describe("addResendToSummary", () => {
  const counts = {
    willReceive: 12,
    pickedByName: 3,
    essentialOverride: 1,
    essentialNotOverridden: 2,
  };

  it("adds the first resend, leaving the send's own fields alone", () => {
    expect(addResendToSummary({ v: 1, willReceive: 40 }, counts)).toEqual({
      v: 1,
      willReceive: 40,
      resends: { count: 1, ...counts },
    });
  });

  it("adds up later ones from a summary that parses", () => {
    const summary = {
      v: 1,
      env: "production",
      narrowed: false,
      sources: [],
      matched: 40,
      eligible: 40,
      willReceive: 40,
      stagingAdmins: 0,
      pickedByName: 0,
      skipped: [],
      channels: { email: true, push: false },
      email: {
        sendTo: 40,
        unsubscribedAnnouncements: 0,
        unsubscribedAll: 0,
        suppressed: 0,
        invalid: 0,
      },
      essentialFestival: null,
      essentialOverride: 0,
      essentialNotOverridden: 0,
      resends: {
        count: 1,
        willReceive: 5,
        pickedByName: 1,
        essentialOverride: 0,
        essentialNotOverridden: 0,
      },
    };
    expect(addResendToSummary(summary, counts)?.resends).toEqual({
      count: 2,
      willReceive: 17,
      pickedByName: 4,
      essentialOverride: 1,
      essentialNotOverridden: 2,
    });
  });

  it("writes nothing over a summary that is not an object", () => {
    expect(addResendToSummary(null, counts)).toBeNull();
  });
});

describe("ResendRefusal", () => {
  it("carries the code and the admin's words", () => {
    const refusal = new ResendRefusal("RETRACTED");
    expect(refusal.code).toBe("RETRACTED");
    expect(refusal.message).toBe(RESEND_MESSAGES.RETRACTED);
    expect(new ResendRefusal("NOBODY", "otra").message).toBe("otra");
  });
});

describe("byChannels (D2, G10)", () => {
  it("groups a chunk's people by the channels their send chose", () => {
    const rows = [
      { id: 1, send_email: true, send_push: false },
      { id: 2, send_email: false, send_push: true },
      { id: 3, send_email: true, send_push: false },
    ];
    expect(byChannels(rows)).toEqual([
      { sendEmail: true, sendPush: false, rows: [rows[0], rows[2]] },
      { sendEmail: false, sendPush: true, rows: [rows[1]] },
    ]);
    expect(byChannels([])).toEqual([]);
  });
});
