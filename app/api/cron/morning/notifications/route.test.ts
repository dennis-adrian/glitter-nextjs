// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { calls, giftsMock, pushMock, emailMock } = vi.hoisted(() => {
  const calls: { pass: string; budgetMs: number }[] = [];
  return {
    calls,
    giftsMock: vi.fn(),
    pushMock: vi.fn(),
    emailMock: vi.fn(),
  };
});

vi.mock("@/app/lib/cron/auth", () => ({
  isAuthorizedCronRequest: () => true,
}));
vi.mock("@/app/lib/credit_gifts/service", () => ({
  resumeProcessingCreditGifts: giftsMock,
}));
vi.mock("@/app/lib/notifications/deliveries", () => ({
  sendDuePushDeliveries: pushMock,
  processPendingNotificationDeliveries: emailMock,
}));

import { GET } from "@/app/api/cron/morning/notifications/route";

/** A pass that records its budget and takes `spends` ms of the clock. */
function pass(name: string, spends: number, result: unknown) {
  return async ({ budgetMs }: { budgetMs: number }) => {
    calls.push({ pass: name, budgetMs });
    vi.advanceTimersByTime(spends);
    return result;
  };
}

describe("the notifications cron", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    calls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("finishes gifts, then sends pushes, then email", async () => {
    giftsMock.mockImplementation(pass("gifts", 0, { gifts: 0, granted: 0 }));
    pushMock.mockImplementation(pass("push", 0, { scanned: 0 }));
    emailMock.mockImplementation(pass("email", 0, { scanned: 0 }));

    const response = await GET(new Request("https://glitter.test/cron"));

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.pass)).toEqual(["gifts", "push", "email"]);
    expect(pushMock).toHaveBeenCalledWith({ limit: 100, budgetMs: 10_000 });
  });

  it("shares one deadline, so a slow pass leaves the next one less", async () => {
    giftsMock.mockImplementation(
      pass("gifts", 60_000, { gifts: 1, granted: 3 }),
    );
    pushMock.mockImplementation(pass("push", 10_000, { scanned: 4 }));
    emailMock.mockImplementation(pass("email", 0, { scanned: 0 }));

    await GET(new Request("https://glitter.test/cron"));

    expect(calls).toEqual([
      { pass: "gifts", budgetMs: 25_000 },
      { pass: "push", budgetMs: 10_000 },
      { pass: "email", budgetMs: 5_000 },
    ]);
  });

  it("gives a pass nothing once the deadline has gone", async () => {
    giftsMock.mockImplementation(
      pass("gifts", 80_000, { gifts: 0, granted: 0 }),
    );
    pushMock.mockImplementation(pass("push", 0, { scanned: 0 }));
    emailMock.mockImplementation(pass("email", 0, { scanned: 0 }));

    await GET(new Request("https://glitter.test/cron"));

    expect(calls.slice(1).map((call) => call.budgetMs)).toEqual([0, 0]);
  });
});
