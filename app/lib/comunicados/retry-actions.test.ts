// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  logFailure: vi.fn(),
  after: vi.fn(),
  revalidatePath: vi.fn(),
  rateLimit: vi.fn(),
  release: vi.fn(),
  runWork: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/app/lib/comunicados/actor", () => ({
  comunicadosActor: mocks.actor,
  logComunicadosFailure: mocks.logFailure,
}));
vi.mock("@/app/lib/comunicados/driver", () => ({
  runComunicadoWork: mocks.runWork,
}));
vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: mocks.rateLimit,
  releaseActionRateLimit: mocks.release,
}));
vi.mock("@/app/lib/comunicados/retry", () => ({
  retryFailedComunicado: mocks.retry,
}));

import {
  comunicadoRetryRateLimit,
  SEND_AFTER_DEADLINE_MS,
} from "@/app/lib/comunicados/definitions";
import { retryFailedComunicadoAction } from "@/app/lib/comunicados/retry-actions";

const ADMIN = { id: 42, role: "admin" };
const BLOCKED = { success: false, message: "No autorizado." } as const;
const T0 = new Date("2026-10-24T14:00:00Z").getTime();

/** The callback the action handed to `after`, run as Next.js would. */
async function runAfter() {
  expect(mocks.after).toHaveBeenCalledTimes(1);
  const [callback] = mocks.after.mock.calls[0]!;
  await callback();
}

beforeEach(() => {
  mocks.actor.mockResolvedValue({ actor: ADMIN, blocked: null });
  mocks.rateLimit.mockResolvedValue(true);
  mocks.release.mockResolvedValue(undefined);
  mocks.runWork.mockResolvedValue({});
  mocks.retry.mockResolvedValue({
    ok: true,
    campaignId: 91,
    emails: 6,
    people: 2,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("retryFailedComunicadoAction", () => {
  it("refuses anyone the guard refuses before reading the input or spending a retry", async () => {
    mocks.actor.mockResolvedValue({ actor: null, blocked: BLOCKED });

    expect(await retryFailedComunicadoAction("7")).toEqual(BLOCKED);
    expect(await retryFailedComunicadoAction(7)).toEqual(BLOCKED);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each([
    ["an id that is not one", "7"],
    ["a negative one", -1],
    ["nothing", undefined],
  ])("refuses %s as not found, spending no retry", async (_label, input) => {
    expect(await retryFailedComunicadoAction(input)).toEqual({
      success: false,
      message: "No encontramos este comunicado.",
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("retries once per 5 minutes per comunicado", async () => {
    mocks.rateLimit.mockResolvedValue(false);

    expect(await retryFailedComunicadoAction(7)).toEqual({
      success: false,
      message: "Ya se reintentó hace poco. Probá de nuevo en unos minutos.",
    });
    expect(mocks.rateLimit).toHaveBeenCalledWith({
      ...comunicadoRetryRateLimit(7),
      now: expect.any(Date),
    });
    expect(comunicadoRetryRateLimit(7)).toEqual({
      key: "comunicado-retry:7",
      limit: 1,
      windowMs: 5 * 60_000,
    });
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("does not retry when the rate limit cannot be read", async () => {
    mocks.rateLimit.mockRejectedValue(new Error("connection refused"));

    expect(await retryFailedComunicadoAction(7)).toEqual({
      success: false,
      message: "No pudimos reintentarlo. Probá de nuevo.",
    });
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("retries as the acting admin, refreshes the list and the page, and drains its own campaign after the answer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    // The guard takes its time: the work still ends on time, counted from
    // the click.
    mocks.actor.mockImplementation(async () => {
      vi.setSystemTime(T0 + 3_000);
      return { actor: ADMIN, blocked: null };
    });

    expect(await retryFailedComunicadoAction(7)).toEqual({
      success: true,
      message: "Los estamos reintentando.",
    });
    expect(mocks.retry).toHaveBeenCalledWith(7, 42);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/dashboard/communications"],
      ["/dashboard/communications/7"],
    ]);
    expect(mocks.runWork).not.toHaveBeenCalled();

    await runAfter();
    expect(mocks.runWork).toHaveBeenCalledWith({
      scope: { campaignId: 91 },
      deadline: T0 + SEND_AFTER_DEADLINE_MS,
      trigger: "send",
    });
    // A retry that happened keeps its slot.
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it.each([
    ["NOTHING", "No hay nada para reintentar."],
    ["RETRACTED", "Este comunicado fue retirado."],
    [
      "OTHER_ENV",
      "Este comunicado se envió desde otro entorno: reintentalo desde allí.",
    ],
    [
      "LOCKED",
      "No pudimos reintentarlo ahora. Probá de nuevo en unos segundos.",
    ],
  ])(
    "passes on a %s refusal without running or refreshing anything",
    async (code, message) => {
      mocks.retry.mockResolvedValue({ ok: false, code, message });

      expect(await retryFailedComunicadoAction(7)).toEqual({
        success: false,
        message,
      });
      expect(mocks.after).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each(["NOTHING", "RETRACTED", "OTHER_ENV", "NOT_SENT", "NOT_FOUND"])(
    "keeps the slot spent on a %s refusal: another click answers the same",
    async (code) => {
      mocks.retry.mockResolvedValue({ ok: false, code, message: "No." });

      await retryFailedComunicadoAction(7);

      expect(mocks.release).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "a lock held past the timeout",
      () =>
        mocks.retry.mockResolvedValue({
          ok: false,
          code: "LOCKED",
          message:
            "No pudimos reintentarlo ahora. Probá de nuevo en unos segundos.",
        }),
    ],
    [
      "a failure",
      () => mocks.retry.mockRejectedValue(new Error("deadlock detected")),
    ],
  ])(
    "gives the slot back after %s, in the window it was spent in, so trying again goes through",
    async (_label, fail) => {
      fail();
      await retryFailedComunicadoAction(7);

      const [spent] = mocks.rateLimit.mock.calls[0]!;
      expect(spent).toEqual({
        ...comunicadoRetryRateLimit(7),
        now: expect.any(Date),
      });
      expect(mocks.release).toHaveBeenCalledTimes(1);
      expect(mocks.release).toHaveBeenCalledWith(spent);
    },
  );

  it("answers the refusal even when the slot cannot be given back", async () => {
    mocks.retry.mockRejectedValue(new Error("connection lost"));
    mocks.release.mockRejectedValue(new Error("connection lost"));

    expect(await retryFailedComunicadoAction(7)).toEqual({
      success: false,
      message: "No pudimos reintentarlo. Probá de nuevo.",
    });
  });

  it("logs an unexpected failure through the type-only logger", async () => {
    const error = new Error("connection lost");
    mocks.retry.mockRejectedValue(error);

    expect(await retryFailedComunicadoAction(7)).toEqual({
      success: false,
      message: "No pudimos reintentarlo. Probá de nuevo.",
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      "[comunicados] retry failed",
      error,
    );
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("logs only the type of a failed run after the answer", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.runWork.mockRejectedValue(
      new TypeError("could not reach ana@example.test"),
    );

    await retryFailedComunicadoAction(7);
    await runAfter();

    expect(consoleError).toHaveBeenCalledWith(
      "[comunicados] retry work failed",
      { campaignId: 91, errorType: "TypeError" },
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("@");
  });
});
