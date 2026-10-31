// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { VERCEL_ENV: "production" as string },
  actor: vi.fn(),
  logFailure: vi.fn(),
  after: vi.fn(),
  revalidatePath: vi.fn(),
  runWork: vi.fn(),
  sendNow: vi.fn(),
  check: vi.fn(),
  picked: vi.fn(),
  launched: vi.fn(),
  rows: [] as unknown[],
  select: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ serverEnv: mocks.env }));
vi.mock("@/db", () => ({
  db: {
    select: mocks.select.mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => mocks.rows }) }),
    })),
  },
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureLaunched: mocks.launched,
}));
vi.mock("@/app/lib/comunicados/actor", () => ({
  comunicadosActor: mocks.actor,
  logComunicadosFailure: mocks.logFailure,
}));
vi.mock("@/app/lib/comunicados/driver", () => ({
  runComunicadoWork: mocks.runWork,
}));
vi.mock("@/app/lib/comunicados/audience", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/comunicados/audience")>()),
  pickedPeopleReceiving: mocks.picked,
}));
vi.mock("@/app/lib/comunicados/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/comunicados/send")>()),
  sendComunicadoNow: mocks.sendNow,
  checkComunicadoSendable: mocks.check,
}));

import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import { SEND_REFUSAL_CODES } from "@/app/lib/comunicados/contracts";
import { SEND_AFTER_DEADLINE_MS } from "@/app/lib/comunicados/definitions";
import { SendRefusal } from "@/app/lib/comunicados/send";
import {
  loadComunicadoSendConfirmationAction,
  sendComunicadoNowAction,
} from "@/app/lib/comunicados/send-actions";

const ADMIN = { id: 42, role: "admin" };
const BLOCKED = { success: false, message: "No autorizado." } as const;
const T0 = new Date("2026-10-24T14:00:00Z").getTime();
const INPUT = { comunicadoId: 7, expectedVersion: 3, typedCount: null };
const STARTED = {
  kind: "started",
  comunicadoId: 7,
  campaignId: 91,
  eligible: 12,
  willReceive: 12,
  skipped: 2,
  narrowed: false,
};

beforeEach(() => {
  mocks.env.VERCEL_ENV = "production";
  mocks.actor.mockResolvedValue({ actor: ADMIN, blocked: null });
  mocks.picked.mockResolvedValue({ count: 0, names: [] });
  mocks.launched.mockResolvedValue(true);
  mocks.rows = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("sendComunicadoNowAction", () => {
  it("refuses anyone the guard refuses before reading the input", async () => {
    mocks.actor.mockResolvedValue({ actor: null, blocked: BLOCKED });

    expect(await sendComunicadoNowAction("nada")).toEqual({
      ...BLOCKED,
      code: "FORBIDDEN",
    });
    expect(mocks.sendNow).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each([
    ["an id that is not one", { ...INPUT, comunicadoId: "7" }],
    ["version 0", { ...INPUT, expectedVersion: 0 }],
    ["a negative count", { ...INPUT, typedCount: -1 }],
    ["a fractional count", { ...INPUT, typedCount: 1.5 }],
    ["no count at all", { comunicadoId: 7, expectedVersion: 3 }],
  ])("refuses %s without sending", async (_label, input) => {
    expect(await sendComunicadoNowAction(input)).toEqual({
      success: false,
      code: "INVALID",
      message: "No pudimos leer la confirmación. Probá de nuevo.",
    });
    expect(mocks.sendNow).not.toHaveBeenCalled();
  });

  it("sends as the acting admin, then drains it after the answer within the action's own budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    // The send itself takes ten seconds: the work still ends on time.
    mocks.sendNow.mockImplementation(async () => {
      vi.setSystemTime(T0 + 10_000);
      return STARTED;
    });

    expect(
      await sendComunicadoNowAction({ ...INPUT, typedCount: 312 }),
    ).toEqual({
      success: true,
      alreadySent: false,
      message: "Lo estamos enviando.",
    });
    expect(mocks.sendNow).toHaveBeenCalledWith({
      comunicadoId: 7,
      expectedVersion: 3,
      typedCount: 312,
      by: ADMIN.id,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/communications",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/communications/7",
    );

    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.runWork).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0]![0]();
    expect(mocks.runWork).toHaveBeenCalledWith({
      scope: { campaignId: 91 },
      deadline: T0 + 85_000,
      trigger: "send",
    });
    expect(SEND_AFTER_DEADLINE_MS).toBe(85_000);
  });

  it("logs a failed drain by its type only", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendNow.mockResolvedValue(STARTED);
    mocks.runWork.mockRejectedValue(new TypeError("ana@example.test"));

    await sendComunicadoNowAction(INPUT);
    await expect(mocks.after.mock.calls[0]![0]()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith("[comunicados] send work failed", {
      campaignId: 91,
      errorType: "TypeError",
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("@");
  });

  it("answers a second click as success, with nothing more to drain", async () => {
    mocks.sendNow.mockResolvedValue({
      kind: "already_sent",
      comunicadoId: 7,
      campaignId: 91,
    });

    expect(await sendComunicadoNowAction(INPUT)).toEqual({
      success: true,
      alreadySent: true,
      message: "Este comunicado ya se está enviando.",
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each(SEND_REFUSAL_CODES)(
    "answers the %s refusal with its code and message",
    async (code) => {
      mocks.sendNow.mockRejectedValue(
        new SendRefusal(code, `Mensaje de ${code}.`),
      );

      expect(await sendComunicadoNowAction(INPUT)).toEqual({
        success: false,
        code,
        message: `Mensaje de ${code}.`,
      });
      expect(mocks.after).not.toHaveBeenCalled();
      expect(mocks.logFailure).not.toHaveBeenCalled();
    },
  );

  it("answers anything else as a failure and logs it", async () => {
    const failure = new Error("connect ECONNREFUSED ana@example.test");
    mocks.sendNow.mockRejectedValue(failure);

    expect(await sendComunicadoNowAction(INPUT)).toEqual({
      success: false,
      code: "FAILED",
      message: "No pudimos enviarlo. Intentá de nuevo en unos minutos.",
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      "[comunicados] send failed",
      failure,
    );
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

const ROW = {
  id: 7,
  status: "draft",
  version: 4,
  title: "  Cambio de horario  ",
  doc: [],
  actionLabel: null,
  actionPath: null,
  sendEmail: true,
  sendPush: true,
  audience: { festivals: [3], lists: [], people: [21, 22] },
  essential: false,
  essentialReason: null,
};

function preview(
  values: Partial<ComunicadoAudiencePreview> = {},
): ComunicadoAudiencePreview {
  return {
    sources: [],
    matched: 320,
    eligible: 312,
    overlap: 0,
    skipped: [],
    skippedTotal: 8,
    willReceive: 4,
    email: {
      sendTo: 4,
      unsubscribedAnnouncements: 0,
      unsubscribedAll: 0,
      suppressed: 0,
      invalid: 0,
      essentialOverride: 0,
    },
    pushDevices: 1,
    pushSubscriptions: 2,
    tooLarge: false,
    narrowed: true,
    stagingAdmins: 2,
    essentialAllowed: {
      ok: true,
      reason: null,
      festival: { id: 3, name: "Glitter Navidad 2026" },
    },
    ...values,
  };
}

function sendable(values: Partial<ComunicadoAudiencePreview> = {}) {
  return {
    ok: true,
    content: { title: "Cambio de horario" },
    preview: preview(values),
  };
}

async function confirmation() {
  const result = await loadComunicadoSendConfirmationAction(7);
  if (!result.success) throw new Error(result.message);
  return result.confirmation;
}

describe("loadComunicadoSendConfirmationAction", () => {
  it("refuses anyone the guard refuses before reading anything", async () => {
    mocks.actor.mockResolvedValue({ actor: null, blocked: BLOCKED });

    expect(await loadComunicadoSendConfirmationAction(7)).toEqual(BLOCKED);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("does not find an id that is not one, or a comunicado that is gone", async () => {
    const notFound = {
      success: false,
      message: "No encontramos este comunicado.",
    };
    expect(await loadComunicadoSendConfirmationAction("7")).toEqual(notFound);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(await loadComunicadoSendConfirmationAction(7)).toEqual(notFound);
  });

  it("refuses one already sent", async () => {
    mocks.rows = [{ ...ROW, status: "sent" }];

    expect(await loadComunicadoSendConfirmationAction(7)).toEqual({
      success: false,
      message: "Este comunicado ya se envió.",
    });
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("counts the stored draft as this environment's send would", async () => {
    mocks.env.VERCEL_ENV = "preview";
    mocks.rows = [ROW];
    mocks.check.mockResolvedValue(sendable());
    mocks.picked.mockResolvedValue({ count: 2, names: ["Ana", "Luis"] });
    mocks.launched.mockResolvedValue(false);

    expect(await confirmation()).toEqual({
      comunicadoId: 7,
      version: 4,
      title: "Cambio de horario",
      sendEmail: true,
      sendPush: true,
      essential: false,
      essentialReason: null,
      essentialFestivalName: null,
      preview: preview(),
      pickedReceiving: { count: 2, names: ["Ana", "Luis"] },
      // 312 can receive it today, before the preview narrows them.
      typedRequired: true,
      env: "preview",
      notificationsLaunched: false,
      problem: null,
    });
    expect(mocks.check).toHaveBeenCalledWith(expect.anything(), ROW, {
      env: "preview",
      narrow: true,
    });
    expect(mocks.picked).toHaveBeenCalledWith(
      expect.anything(),
      [21, 22],
      true,
    );
    expect(mocks.launched).toHaveBeenCalledWith("notifications");
  });

  it("asks for the count below 300 only when essential, and names its festival", async () => {
    mocks.rows = [
      { ...ROW, essential: true, essentialReason: "  Llueve en el armado  " },
    ];
    mocks.check.mockResolvedValue(sendable({ eligible: 12, narrowed: false }));

    expect(await confirmation()).toMatchObject({
      env: "production",
      essential: true,
      essentialReason: "Llueve en el armado",
      essentialFestivalName: "Glitter Navidad 2026",
      typedRequired: true,
    });
    expect(mocks.picked).toHaveBeenCalledWith(
      expect.anything(),
      [21, 22],
      false,
    );

    // The same twelve, not essential.
    mocks.rows = [ROW];
    expect(await confirmation()).toMatchObject({
      essentialReason: null,
      essentialFestivalName: null,
      typedRequired: false,
    });
    mocks.check.mockResolvedValue(sendable({ eligible: 299 }));
    expect((await confirmation()).typedRequired).toBe(false);
    mocks.check.mockResolvedValue(sendable({ eligible: 300 }));
    expect((await confirmation()).typedRequired).toBe(true);
  });

  it("says what the send would refuse, with the numbers it could count", async () => {
    mocks.rows = [{ ...ROW, title: "   " }];
    mocks.check.mockResolvedValue({
      ok: false,
      refusal: new SendRefusal("INVALID_CONTENT", "Escribí un título."),
      preview: preview(),
    });

    expect(await confirmation()).toMatchObject({
      title: "Sin título",
      preview: preview(),
      problem: "Escribí un título.",
    });
  });

  it("warns of the cap and of an audience nobody in can receive it", async () => {
    mocks.rows = [ROW];
    mocks.check.mockResolvedValue(
      sendable({ eligible: 3_001, tooLarge: true }),
    );
    expect((await confirmation()).problem).toBe(
      "Por ahora un comunicado llega a 3.000 personas como máximo. Achicá la audiencia con una lista más precisa.",
    );

    mocks.check.mockResolvedValue(sendable({ eligible: 0, willReceive: 2 }));
    expect((await confirmation()).problem).toBe(
      "Nadie de esta audiencia puede recibirlo.",
    );
  });

  it("names nobody picked when the stored audience no longer parses", async () => {
    mocks.rows = [{ ...ROW, audience: { people: "todos" } }];
    mocks.check.mockResolvedValue({
      ok: false,
      refusal: new SendRefusal("INVALID_AUDIENCE", "No pudimos leer."),
      preview: preview({ eligible: 0 }),
    });

    expect((await confirmation()).problem).toBe("No pudimos leer.");
    expect(mocks.picked).toHaveBeenCalledWith(expect.anything(), [], false);
  });

  it("answers a failed count with a retry and logs it", async () => {
    const failure = new Error("timeout");
    mocks.rows = [ROW];
    mocks.check.mockRejectedValue(failure);

    expect(await loadComunicadoSendConfirmationAction(7)).toEqual({
      success: false,
      message: "No pudimos contar los destinatarios. Probá de nuevo.",
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      "[comunicados] send confirmation failed",
      failure,
    );
  });
});
