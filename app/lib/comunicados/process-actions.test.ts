// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { VERCEL_ENV: "preview" as string },
  actor: vi.fn(),
  after: vi.fn(),
  rateLimit: vi.fn(),
  runWork: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ serverEnv: mocks.env }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/app/lib/comunicados/actor", () => ({
  comunicadosActor: mocks.actor,
}));
vi.mock("@/app/lib/comunicados/driver", () => ({
  runComunicadoWork: mocks.runWork,
}));
vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: mocks.rateLimit,
}));

import {
  COMUNICADOS_PROCESS_RATE_LIMIT,
  PROCESS_BUTTON_DEADLINE_MS,
} from "@/app/lib/comunicados/definitions";
import { processPendingComunicadosAction } from "@/app/lib/comunicados/process-actions";

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
  mocks.env.VERCEL_ENV = "preview";
  mocks.actor.mockResolvedValue({ actor: ADMIN, blocked: null });
  mocks.rateLimit.mockResolvedValue(true);
  mocks.runWork.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("processPendingComunicadosAction", () => {
  it("refuses anyone the guard refuses before anything else", async () => {
    mocks.actor.mockResolvedValue({ actor: null, blocked: BLOCKED });
    mocks.env.VERCEL_ENV = "production";

    expect(await processPendingComunicadosAction()).toEqual(BLOCKED);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each(["production", "development"])(
    "is refused in %s, where the cron or a send's own run drains the lane",
    async (env) => {
      mocks.env.VERCEL_ENV = env;

      expect(await processPendingComunicadosAction()).toEqual({
        success: false,
        message: "Esto solo se usa en un entorno de prueba.",
      });
      expect(mocks.rateLimit).not.toHaveBeenCalled();
      expect(mocks.after).not.toHaveBeenCalled();
    },
  );

  it("runs once per 30 seconds across every admin", async () => {
    mocks.rateLimit.mockResolvedValue(false);

    expect(await processPendingComunicadosAction()).toEqual({
      success: false,
      message:
        "Ya se están procesando. Esperá unos segundos y volvé a intentarlo.",
    });
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      COMUNICADOS_PROCESS_RATE_LIMIT,
    );
    expect(COMUNICADOS_PROCESS_RATE_LIMIT).toEqual({
      key: "comunicados-process",
      limit: 1,
      windowMs: 30_000,
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("does not run when the rate limit cannot be read", async () => {
    mocks.rateLimit.mockRejectedValue(new Error("connection refused"));

    expect(await processPendingComunicadosAction()).toEqual({
      success: false,
      message:
        "No pudimos procesar los envíos. Intentá de nuevo en unos minutos.",
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("drains the whole lane after the answer, by 80 s from the click", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    // The guard and the rate limit take their time: the work still ends on
    // time, counted from the click.
    mocks.actor.mockImplementation(async () => {
      vi.setSystemTime(T0 + 3_000);
      return { actor: ADMIN, blocked: null };
    });

    expect(await processPendingComunicadosAction()).toEqual({
      success: true,
      message: "Procesando los envíos pendientes. En un minuto deberían verse.",
    });
    expect(mocks.runWork).not.toHaveBeenCalled();

    await runAfter();
    expect(PROCESS_BUTTON_DEADLINE_MS).toBe(80_000);
    expect(mocks.runWork).toHaveBeenCalledWith({
      scope: "lane",
      deadline: T0 + 80_000,
      trigger: "button",
    });
  });

  it("logs only the type of a failed run", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.runWork.mockRejectedValue(
      new TypeError("could not reach ana@example.test"),
    );

    await processPendingComunicadosAction();
    await runAfter();

    expect(consoleError).toHaveBeenCalledWith(
      "[comunicados] button work failed",
      { errorType: "TypeError" },
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("@");
  });
});
