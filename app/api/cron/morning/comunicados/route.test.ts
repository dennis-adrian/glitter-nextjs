// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

/**
 * The comunicados cron with the real driver (docs/IMPLEMENTATION-comunicados.md
 * D9, D-9, D-10, D-11): the steps it calls, the deadline it hands them, and
 * what it leaves for the next run. The steps themselves are mocked; they have
 * their own integration tests.
 */

const T0 = Date.UTC(2026, 9, 26, 12, 0, 0);
const SECRET = "comunicados-cron-secret";

const { state, mocks } = vi.hoisted(() => ({
  state: {
    vercelEnv: "production" as string,
    envThrows: false,
    baseUrl: "https://glitter.test",
  },
  mocks: {
    releaseDueComunicados: vi.fn(),
    fanOutComunicado: vi.fn(),
    fanOutPendingComunicados: vi.fn(),
    completeComunicadoCampaign: vi.fn(),
    sweepComunicadoCompletions: vi.fn(),
    sendBulkPushes: vi.fn(),
    sendBulkEmails: vi.fn(),
    expireBulkEmails: vi.fn(),
    flagRead: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  serverEnv: {
    get VERCEL_ENV() {
      if (state.envThrows) throw new Error("env unreadable ana@example.test");
      return state.vercelEnv;
    },
  },
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/vendors/resend", () => ({ sendBatchEmails: vi.fn() }));
vi.mock("@/app/lib/comunicados/delivery", () => ({
  comunicadoBatchRenderer: {},
}));
vi.mock("@/app/lib/comunicados/release", () => ({
  releaseDueComunicados: mocks.releaseDueComunicados,
}));
vi.mock("@/app/lib/comunicados/fanout", () => ({
  fanOutComunicado: mocks.fanOutComunicado,
  fanOutPendingComunicados: mocks.fanOutPendingComunicados,
  completeComunicadoCampaign: mocks.completeComunicadoCampaign,
  sweepComunicadoCompletions: mocks.sweepComunicadoCompletions,
}));
// The lane's rules (the reserve, `hasBatchTime`, `errorCode`) stay real.
vi.mock("@/app/lib/notifications/bulk-email", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/app/lib/notifications/bulk-email")
  >()),
  sendBulkEmails: mocks.sendBulkEmails,
  expireBulkEmails: mocks.expireBulkEmails,
}));
vi.mock("@/app/lib/notifications/deliveries", () => ({
  sendBulkPushes: mocks.sendBulkPushes,
}));
vi.mock("@/app/lib/urls", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/urls")>()),
  publicBaseUrl: () => state.baseUrl,
}));
// G2: hiding the flag never stops what was already sent. Nothing on this
// path may read it.
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureEnabled: mocks.flagRead,
  isFeatureLaunched: mocks.flagRead,
  featureFlagGuard: mocks.flagRead,
}));

import { GET } from "@/app/api/cron/morning/comunicados/route";

function cronRequest(authorization?: string) {
  return new Request("https://glitter.test/api/cron/morning/comunicados", {
    headers: authorization ? { authorization } : {},
  });
}

const authorized = () => cronRequest(`Bearer ${SECRET}`);

function fanoutRun(overrides: Record<string, unknown> = {}) {
  return {
    chunks: 2,
    notified: 480,
    skipped: 20,
    failed: 0,
    stopped: "done",
    pushDeliveryIds: [],
    campaignIds: [11, 12],
    ...overrides,
  };
}

function emailRun(overrides: Record<string, unknown> = {}) {
  return {
    expired: 1,
    batches: 3,
    requests: 3,
    sent: 250,
    skipped: 4,
    failed: 0,
    retry: 0,
    released: 0,
    throttles: 0,
    busy: 0,
    stopped: "idle",
    ...overrides,
  };
}

function releaseRun(overrides: Record<string, unknown> = {}) {
  return {
    released: 0,
    missed: 0,
    failed: 0,
    campaignIds: [],
    triedIds: [],
    ...overrides,
  };
}

const PUSHES = { scanned: 7, sent: 6, skipped: 1, failed: 0, retry: 0 };

/** The env a scope SQL filters on, as the statement's parameters. */
function scopeParams(scope: SQL) {
  return new PgDialect().sqlToQuery(scope).params;
}

async function bodyOf(response: Response) {
  return (await response.json()) as {
    data?: Record<string, unknown> & { failedSteps: string[] };
    error?: string;
  };
}

describe("the comunicados cron", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleLog: MockInstance<typeof console.log>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.stubEnv("CRON_SECRET", SECRET);
    state.vercelEnv = "production";
    state.envThrows = false;
    state.baseUrl = "https://glitter.test";
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.releaseDueComunicados.mockResolvedValue(releaseRun());
    mocks.fanOutPendingComunicados.mockResolvedValue(fanoutRun());
    mocks.completeComunicadoCampaign.mockResolvedValue(true);
    mocks.sweepComunicadoCompletions.mockResolvedValue({
      checked: 3,
      completed: 1,
    });
    mocks.sendBulkPushes.mockResolvedValue(PUSHES);
    mocks.sendBulkEmails.mockResolvedValue(emailRun());
    mocks.expireBulkEmails.mockResolvedValue(3);
    mocks.flagRead.mockRejectedValue(new Error("The cron read the flag"));
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    const logged = JSON.stringify([
      ...consoleError.mock.calls,
      ...consoleLog.mock.calls,
    ]);
    consoleError.mockRestore();
    consoleLog.mockRestore();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    // Ids, codes and counts only.
    expect(logged).not.toContain("@");
  });

  it("refuses anyone without the scheduler's bearer, before any work", async () => {
    for (const authorization of [
      undefined,
      SECRET,
      "Bearer wrong",
      `Bearer ${SECRET}x`,
    ]) {
      const response = await GET(cronRequest(authorization));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    }
    // A deployment that forgot the secret is closed, not open.
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(cronRequest("Bearer "))).status).toBe(401);

    expect(mocks.releaseDueComunicados).not.toHaveBeenCalled();
    expect(mocks.fanOutPendingComunicados).not.toHaveBeenCalled();
    expect(mocks.sendBulkPushes).not.toHaveBeenCalled();
    expect(mocks.sendBulkEmails).not.toHaveBeenCalled();
    expect(mocks.expireBulkEmails).not.toHaveBeenCalled();
    expect(mocks.sweepComunicadoCompletions).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("runs every step of the lane for this environment against one 75-second deadline", async () => {
    const response = await GET(authorized());

    expect(response.status).toBe(200);
    const deadline = T0 + 75_000;
    // Due schedules first, against the same deadline (E2).
    expect(mocks.releaseDueComunicados).toHaveBeenCalledWith({
      deadline,
      now: expect.any(Function),
    });
    expect(
      mocks.releaseDueComunicados.mock.invocationCallOrder[0]!,
    ).toBeLessThan(mocks.fanOutPendingComunicados.mock.invocationCallOrder[0]!);
    expect(mocks.fanOutPendingComunicados).toHaveBeenCalledWith({
      env: "production",
      deadline,
      now: expect.any(Function),
    });
    expect(mocks.fanOutComunicado).not.toHaveBeenCalled();

    const [pushOptions] = mocks.sendBulkPushes.mock.calls[0]!;
    expect(pushOptions).toEqual({ scope: expect.anything(), budgetMs: 20_000 });
    expect(scopeParams(pushOptions.scope)).toEqual(["production"]);

    expect(mocks.sendBulkEmails).toHaveBeenCalledWith({
      deadline,
      timing: undefined,
      now: expect.any(Function),
    });
    expect(mocks.expireBulkEmails).not.toHaveBeenCalled();

    // Each campaign it fanned out, then the sweep.
    expect(mocks.completeComunicadoCampaign.mock.calls).toEqual([[11], [12]]);
    expect(mocks.sweepComunicadoCompletions).toHaveBeenCalledOnce();
    expect(mocks.flagRead).not.toHaveBeenCalled();

    const { data } = await bodyOf(response);
    expect(data).toEqual({
      trigger: "cron",
      env: "production",
      released: 0,
      missed: 0,
      chunks: 2,
      notified: 480,
      skipped: 20,
      failed: 0,
      pushes: PUSHES,
      email: emailRun(),
      emailSkipped: null,
      expired: 1,
      completed: 3,
      failedSteps: [],
      ms: 0,
    });
    expect(consoleLog).toHaveBeenCalledWith("[comunicados] tick", {
      trigger: "cron",
      released: 0,
      missed: 0,
      chunks: 2,
      pushes: 6,
      batches: 3,
      expired: 1,
      throttles: 0,
      ms: 0,
    });
  });

  it("counts what the release sent and missed, and closes the campaigns it started", async () => {
    mocks.releaseDueComunicados.mockResolvedValue(
      releaseRun({
        released: 2,
        missed: 1,
        failed: 1,
        campaignIds: [21, 11],
        triedIds: [5, 6, 7, 8],
      }),
    );

    const { data } = await bodyOf(await GET(authorized()));

    expect(data).toMatchObject({ released: 2, missed: 1, failedSteps: [] });
    // Each campaign once: the release's, then the fan-out's.
    expect(mocks.completeComunicadoCampaign.mock.calls).toEqual([
      [21],
      [11],
      [12],
    ]);
    expect(consoleLog).toHaveBeenCalledWith(
      "[comunicados] tick",
      expect.objectContaining({ released: 2, missed: 1 }),
    );
  });

  it("starts no batch with less than 25 s left: it only expires, and completion still runs", async () => {
    mocks.fanOutPendingComunicados.mockImplementation(async () => {
      vi.advanceTimersByTime(55_000);
      return fanoutRun();
    });

    const { data } = await bodyOf(await GET(authorized()));

    expect(mocks.sendBulkPushes).toHaveBeenCalledWith({
      scope: expect.anything(),
      budgetMs: 20_000,
    });
    expect(mocks.sendBulkEmails).not.toHaveBeenCalled();
    expect(mocks.expireBulkEmails).toHaveBeenCalledOnce();
    expect(mocks.sweepComunicadoCompletions).toHaveBeenCalledOnce();
    expect(data).toMatchObject({
      email: null,
      emailSkipped: "deadline",
      expired: 3,
      failedSteps: [],
      ms: 55_000,
    });
  });

  it("gives push what is left of the run, at most 20 s, and nothing once it is over", async () => {
    mocks.fanOutPendingComunicados.mockImplementation(async () => {
      vi.advanceTimersByTime(60_000);
      return fanoutRun();
    });
    await GET(authorized());
    expect(mocks.sendBulkPushes).toHaveBeenCalledWith({
      scope: expect.anything(),
      budgetMs: 15_000,
    });

    mocks.sendBulkPushes.mockClear();
    mocks.fanOutPendingComunicados.mockImplementation(async () => {
      vi.advanceTimersByTime(80_000);
      return fanoutRun();
    });
    const { data } = await bodyOf(await GET(authorized()));
    expect(mocks.sendBulkPushes).not.toHaveBeenCalled();
    expect(data).toMatchObject({ emailSkipped: "deadline", completed: 3 });
  });

  it("in development leaves out the email step entirely, expiry included", async () => {
    state.vercelEnv = "development";

    const { data } = await bodyOf(await GET(authorized()));

    expect(mocks.sendBulkEmails).not.toHaveBeenCalled();
    expect(mocks.expireBulkEmails).not.toHaveBeenCalled();
    // Nothing releases a shared database's schedules from a dev server (K9).
    expect(mocks.releaseDueComunicados).not.toHaveBeenCalled();
    expect(mocks.fanOutPendingComunicados).toHaveBeenCalledWith(
      expect.objectContaining({ env: "development" }),
    );
    expect(scopeParams(mocks.sendBulkPushes.mock.calls[0]![0].scope)).toEqual([
      "development",
    ]);
    expect(data).toMatchObject({
      env: "development",
      email: null,
      emailSkipped: "development",
      expired: 0,
      failedSteps: [],
    });
  });

  it("sends no email while the public base URL would break its links", async () => {
    state.vercelEnv = "preview";
    state.baseUrl = "http://localhost:3000";

    const response = await GET(authorized());

    expect(response.status).toBe(200);
    expect(mocks.sendBulkEmails).not.toHaveBeenCalled();
    expect(mocks.expireBulkEmails).not.toHaveBeenCalled();
    expect((await bodyOf(response)).data).toMatchObject({
      env: "preview",
      emailSkipped: "base_url",
      failedSteps: [],
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[comunicados] email step skipped:",
      'the public base URL "http://localhost:3000" is not https',
    );
  });

  it("reports a failing step and goes on, so completion still runs", async () => {
    mocks.releaseDueComunicados.mockRejectedValue(
      Object.assign(new Error("claim failed ana@example.test"), {
        code: "40001",
      }),
    );
    mocks.fanOutPendingComunicados.mockRejectedValue(
      Object.assign(new Error("lost ana@example.test"), { code: "57P01" }),
    );
    mocks.sendBulkEmails.mockRejectedValue(new TypeError("claim failed"));

    const response = await GET(authorized());

    expect(response.status).toBe(200);
    const { data } = await bodyOf(response);
    expect(data?.failedSteps).toEqual(["release", "fanout", "email"]);
    expect(mocks.sendBulkPushes).toHaveBeenCalledOnce();
    expect(mocks.completeComunicadoCampaign).not.toHaveBeenCalled();
    expect(mocks.sweepComunicadoCompletions).toHaveBeenCalledOnce();
    expect(data).toMatchObject({ released: 0, chunks: 0, completed: 1 });
    expect(consoleError.mock.calls).toEqual([
      [
        "[comunicados] work step failed",
        { trigger: "cron", step: "release", errorType: "Error", code: "40001" },
      ],
      [
        "[comunicados] work step failed",
        { trigger: "cron", step: "fanout", errorType: "Error", code: "57P01" },
      ],
      [
        "[comunicados] work step failed",
        { trigger: "cron", step: "email", errorType: "TypeError", code: null },
      ],
    ]);
  });

  it("keeps sweeping when closing one campaign fails", async () => {
    mocks.completeComunicadoCampaign
      .mockRejectedValueOnce(new Error("deadlock"))
      .mockResolvedValueOnce(true);

    const { data } = await bodyOf(await GET(authorized()));

    expect(mocks.completeComunicadoCampaign).toHaveBeenCalledTimes(2);
    expect(mocks.sweepComunicadoCompletions).toHaveBeenCalledOnce();
    expect(data).toMatchObject({ failedSteps: ["completion"], completed: 2 });
  });

  it("answers 500, with the error's type only, when the run cannot start", async () => {
    state.envThrows = true;

    const response = await GET(authorized());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Error processing comunicados",
    });
    expect(consoleError).toHaveBeenCalledWith("Error processing comunicados", {
      errorType: "Error",
    });
  });
});
