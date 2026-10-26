// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ serverEnv: { VERCEL_ENV: "production" } }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdmin: vi.fn() }));

import type {
  ComunicadoAudiencePreview,
  ComunicadoSnapshotCounts,
} from "@/app/lib/comunicados/audience";
import { parseComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import {
  audienceChangedMessage,
  audienceTooLargeMessage,
  buildAudienceSummary,
  SendRefusal,
  typedConfirmationRequired,
  withSendRetry,
} from "@/app/lib/comunicados/send";

describe("typedConfirmationRequired", () => {
  it("asks for the count from 300 people on", () => {
    expect(typedConfirmationRequired(299, false)).toBe(false);
    expect(typedConfirmationRequired(300, false)).toBe(true);
    expect(typedConfirmationRequired(3_000, false)).toBe(true);
  });

  it("always asks for it on an essential send", () => {
    expect(typedConfirmationRequired(1, true)).toBe(true);
    expect(typedConfirmationRequired(299, true)).toBe(true);
  });
});

describe("refusal copy", () => {
  it("says how many there are now, in the singular for one", () => {
    expect(audienceChangedMessage(1)).toBe(
      "La audiencia cambió: ahora es 1 persona. Revisá y confirmá de nuevo.",
    );
    expect(audienceChangedMessage(1251)).toBe(
      "La audiencia cambió: ahora son 1.251 personas. Revisá y confirmá de nuevo.",
    );
  });

  it("names the cap", () => {
    expect(audienceTooLargeMessage()).toBe(
      "Por ahora un comunicado llega a 3.000 personas como máximo. Achicá la audiencia con una lista más precisa.",
    );
  });

  it("carries its code and, after the snapshot, the count", () => {
    const refusal = new SendRefusal("AUDIENCE_CHANGED", "cambió", {
      eligible: 12,
    });
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal).toMatchObject({
      name: "SendRefusal",
      code: "AUDIENCE_CHANGED",
      message: "cambió",
      eligible: 12,
    });
    expect(new SendRefusal("STALE", "cambió").eligible).toBeNull();
  });
});

function preview(
  values: Partial<ComunicadoAudiencePreview> = {},
): ComunicadoAudiencePreview {
  return {
    sources: [
      {
        kind: "festival",
        id: 4,
        label: "Confirmados · Glitter Navidad 2026",
        count: { eligible: 300, skipped: 12 },
        problem: null,
      },
      {
        kind: "people",
        id: null,
        label: "2 personas por nombre",
        count: { eligible: 2, skipped: 0 },
        problem: null,
      },
    ],
    matched: 314,
    eligible: 302,
    overlap: 0,
    skipped: [{ reason: "Perfil no verificado", count: 12 }],
    skippedTotal: 12,
    willReceive: 302,
    email: {
      sendTo: 250,
      unsubscribedAnnouncements: 30,
      unsubscribedAll: 4,
      suppressed: 12,
      invalid: 6,
      essentialOverride: 0,
    },
    pushDevices: 40,
    pushSubscriptions: 52,
    tooLarge: false,
    narrowed: false,
    stagingAdmins: 0,
    essentialAllowed: {
      ok: true,
      reason: null,
      festival: { id: 4, name: "Glitter Navidad 2026" },
    },
    ...values,
  };
}

const SNAPSHOT: ComunicadoSnapshotCounts = {
  matched: 314,
  eligible: 302,
  willReceive: 302,
  stagingAdmins: 0,
  pickedByName: 2,
  skipped: [{ reason: "Perfil no verificado", count: 12 }],
};

function summary(
  values: Partial<Parameters<typeof buildAudienceSummary>[0]> = {},
) {
  return buildAudienceSummary({
    env: "production",
    narrowed: false,
    preview: preview(),
    snapshot: SNAPSHOT,
    sendEmail: true,
    sendPush: false,
    essential: false,
    ...values,
  });
}

describe("buildAudienceSummary", () => {
  it("is a summary the drains and the report can read back", () => {
    const built = summary({ env: "preview", narrowed: true, sendPush: true });
    expect(parseComunicadoAudienceSummary(built)).toEqual(built);
    expect(built).toMatchObject({
      v: 1,
      env: "preview",
      narrowed: true,
      channels: { email: true, push: true },
    });
  });

  it("takes the totals and the skips from the snapshot", () => {
    const built = summary({
      // The preview, counted a moment earlier, is only for display.
      preview: preview({ matched: 1, eligible: 1, willReceive: 1 }),
      snapshot: {
        ...SNAPSHOT,
        stagingAdmins: 3,
        skipped: [
          { reason: "Entorno de prueba: no se envía a listas", count: 300 },
        ],
      },
    });
    expect(built).toMatchObject({
      matched: 314,
      eligible: 302,
      willReceive: 302,
      stagingAdmins: 3,
      pickedByName: 2,
      skipped: [
        { reason: "Entorno de prueba: no se envía a listas", count: 300 },
      ],
    });
  });

  it("gives each source who matched and who can receive it", () => {
    expect(summary().sources).toEqual([
      {
        kind: "festival",
        id: 4,
        label: "Confirmados · Glitter Navidad 2026",
        matched: 312,
        eligible: 300,
      },
      {
        kind: "people",
        id: null,
        label: "2 personas por nombre",
        matched: 2,
        eligible: 2,
      },
    ]);
  });

  it("splits email by B7, and zeros it when email is not ticked", () => {
    expect(summary().email).toEqual({
      sendTo: 250,
      unsubscribedAnnouncements: 30,
      unsubscribedAll: 4,
      suppressed: 12,
      invalid: 6,
    });
    expect(summary({ sendEmail: false })).toMatchObject({
      channels: { email: false, push: false },
      email: {
        sendTo: 0,
        unsubscribedAnnouncements: 0,
        unsubscribedAll: 0,
        suppressed: 0,
        invalid: 0,
      },
    });
  });

  it("records what an essential send reached and did not", () => {
    const essential = summary({
      essential: true,
      preview: preview({
        email: {
          sendTo: 280,
          unsubscribedAnnouncements: 0,
          unsubscribedAll: 4,
          suppressed: 12,
          invalid: 6,
          essentialOverride: 30,
        },
      }),
    });
    expect(essential).toMatchObject({
      essentialFestival: { id: 4, name: "Glitter Navidad 2026" },
      essentialOverride: 30,
      essentialNotOverridden: 16,
    });

    expect(summary()).toMatchObject({
      essentialFestival: null,
      essentialOverride: 0,
      essentialNotOverridden: 0,
    });
  });
});

/** As drizzle throws a failed query: the driver error is its cause. */
function queryError(code: string) {
  return new Error("Failed query", {
    cause: Object.assign(new Error(), { code }),
  });
}

describe("withSendRetry", () => {
  it.each(["40P01", "23503"])("tries once more after %s", async (code) => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(queryError(code))
      .mockResolvedValueOnce("sent");
    await expect(withSendRetry(run)).resolves.toBe("sent");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("tries only once more", async () => {
    const second = queryError("40P01");
    const run = vi
      .fn()
      .mockRejectedValueOnce(queryError("23503"))
      .mockRejectedValueOnce(second);
    await expect(withSendRetry(run)).rejects.toBe(second);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not retry a refusal or another error", async () => {
    for (const error of [
      new SendRefusal("STALE", "cambió"),
      queryError("23505"),
      new Error("boom"),
    ]) {
      const run = vi.fn().mockRejectedValueOnce(error);
      await expect(withSendRetry(run)).rejects.toBe(error);
      expect(run).toHaveBeenCalledTimes(1);
    }
  });
});
