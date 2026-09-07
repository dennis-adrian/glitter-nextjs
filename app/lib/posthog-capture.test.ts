import posthog from "posthog-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureClientEvent,
  identifyClientUser,
  resetClientIdentity,
} from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() },
}));

const capture = vi.mocked(posthog.capture);
const identify = vi.mocked(posthog.identify);
const reset = vi.mocked(posthog.reset);

afterEach(() => {
  vi.restoreAllMocks();
  capture.mockReset();
  identify.mockReset();
  reset.mockReset();
});

describe("captureClientEvent", () => {
  it("forwards the event and properties", () => {
    captureClientEvent(POSTHOG_EVENTS.PROGRAM_VOUCHER_SUBMITTED, {
      purchase_id: 7,
    });

    expect(capture).toHaveBeenCalledWith("program_voucher_submitted", {
      purchase_id: 7,
    });
  });

  /**
   * The reason this helper exists. `posthog.capture` runs `before_send` hooks
   * without a `try`, and our callers sit inside the `try` of a checkout or
   * upload handler — a throw here would report a successful purchase as failed.
   */
  it("does not throw when capture throws", () => {
    capture.mockImplementation(() => {
      throw new Error("before_send blew up");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      captureClientEvent(POSTHOG_EVENTS.PROGRAM_REGISTRATION_COMPLETED),
    ).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("identifyClientUser", () => {
  it("forwards the distinct id and properties", () => {
    identifyClientUser("user_1", { email: "a@b.co" });
    expect(identify).toHaveBeenCalledWith("user_1", { email: "a@b.co" });
  });

  /** Called from an effect, where a throw would hit the error boundary. */
  it("does not throw when identify throws", () => {
    identify.mockImplementation(() => {
      throw new Error("boom");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => identifyClientUser("user_1")).not.toThrow();
  });
});

describe("resetClientIdentity", () => {
  it("does not throw when reset throws", () => {
    reset.mockImplementation(() => {
      throw new Error("boom");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => resetClientIdentity()).not.toThrow();
  });
});
