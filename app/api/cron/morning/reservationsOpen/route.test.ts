// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendDueReservationsOpenNotices } = vi.hoisted(() => ({
  sendDueReservationsOpenNotices: vi.fn(),
}));

vi.mock("@/app/lib/festivals/reservations-open-notices", () => ({
  sendDueReservationsOpenNotices,
}));

import { GET } from "@/app/api/cron/morning/reservationsOpen/route";

const SECRET = "cron-secret-for-tests";

function cronRequest(authorization?: string) {
  return new Request("https://example.test/api/cron/morning/reservationsOpen", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  sendDueReservationsOpenNotices.mockReset();
  sendDueReservationsOpenNotices.mockResolvedValue({
    due: 1,
    sent: [{ festivalId: 3, campaignId: 9, recipients: 12 }],
    failed: 0,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reservationsOpen cron route", () => {
  it("sends the due notices for the cron secret, with a deadline", async () => {
    const before = Date.now();
    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(sendDueReservationsOpenNotices).toHaveBeenCalledOnce();
    const [{ deadline }] = sendDueReservationsOpenNotices.mock.calls[0]!;
    expect(deadline).toBeGreaterThan(before);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 75_000);
    expect(await response.json()).toEqual({
      data: {
        due: 1,
        sent: [{ festivalId: 3, campaignId: 9, recipients: 12 }],
        failed: 0,
      },
    });
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer not-the-secret"],
  ])("refuses %s without sending", async (_case, authorization) => {
    const response = await GET(cronRequest(authorization));

    expect(response.status).toBe(401);
    expect(sendDueReservationsOpenNotices).not.toHaveBeenCalled();
  });

  it("answers 500 without details when the run cannot start", async () => {
    sendDueReservationsOpenNotices.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("db down");
  });
});
