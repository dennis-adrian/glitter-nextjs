// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Callers await `captureServerEvent` after the work it reports is committed
 * (an order's voucher, a new profile) and do not guard it: it must never
 * reject, whatever PostHog or the view check does.
 */

const { client, constructed, viewCheck } = vi.hoisted(() => ({
  client: {
    capture: vi.fn(),
    shutdown: vi.fn<(timeoutMs?: number) => Promise<void>>(async () => {}),
  },
  constructed: { fail: false },
  viewCheck: vi.fn(async () => false),
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor() {
      if (constructed.fail) throw new Error("bad token");
      return client;
    }
  },
}));
vi.mock("@/env", () => ({
  serverEnv: { VERCEL_ENV: "production" },
  getClientEnv: () => ({
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test",
    NEXT_PUBLIC_POSTHOG_HOST: "https://example.test",
  }),
}));
vi.mock("@/db/write-guard", () => ({ isViewRequest: viewCheck }));

import {
  captureServerEvent,
  POSTHOG_SHUTDOWN_TIMEOUT_MS,
} from "@/app/lib/posthog-server";

const input = {
  distinctId: "user_ana",
  event: "order_payment_voucher_uploaded" as const,
  context: "test",
};

beforeEach(() => {
  constructed.fail = false;
  client.capture.mockReset();
  client.shutdown.mockReset();
  client.shutdown.mockResolvedValue(undefined);
  viewCheck.mockReset();
  viewCheck.mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("captureServerEvent", () => {
  it("captures, then flushes within the shutdown limit", async () => {
    await expect(captureServerEvent(input)).resolves.toBeUndefined();
    expect(client.capture).toHaveBeenCalledWith({
      distinctId: "user_ana",
      event: "order_payment_voucher_uploaded",
      properties: undefined,
    });
    expect(client.shutdown).toHaveBeenCalledWith(POSTHOG_SHUTDOWN_TIMEOUT_MS);
  });

  it.each([
    [
      "the client cannot be created",
      () => {
        constructed.fail = true;
      },
    ],
    [
      "capture throws",
      () => {
        client.capture.mockImplementation(() => {
          throw new Error("capture failed");
        });
      },
    ],
    [
      "the flush fails or times out",
      () => {
        client.shutdown.mockRejectedValue(new Error("timeout"));
      },
    ],
    [
      "the view check fails",
      () => {
        viewCheck.mockRejectedValue(new Error("database down"));
      },
    ],
  ])("resolves when %s", async (_, arrange) => {
    arrange();
    await expect(captureServerEvent(input)).resolves.toBeUndefined();
  });
});
