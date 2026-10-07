import posthog from "posthog-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureClientEvent,
  identifyClientUser,
  resetClientIdentity,
} from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    get_property: vi.fn(),
  },
}));

const capture = vi.mocked(posthog.capture);
const identify = vi.mocked(posthog.identify);
const reset = vi.mocked(posthog.reset);
const getProperty = vi.mocked(posthog.get_property);

afterEach(() => {
  vi.restoreAllMocks();
  capture.mockReset();
  identify.mockReset();
  reset.mockReset();
  getProperty.mockReset();
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
  it("clears an identity that identify set", () => {
    getProperty.mockReturnValue("identified");

    resetClientIdentity();

    expect(getProperty).toHaveBeenCalledWith("$user_state");
    expect(reset).toHaveBeenCalledOnce();
  });

  /**
   * Every signed-out page load calls this. Resetting an anonymous visitor
   * dropped the utm_* params their landing pageview stored and gave the rest of
   * their visit a new id, so a campaign could never be credited with anything.
   */
  it("leaves an anonymous visitor, and their campaign params, alone", () => {
    getProperty.mockReturnValue("anonymous");
    resetClientIdentity();

    getProperty.mockReturnValue(undefined);
    resetClientIdentity();

    expect(reset).not.toHaveBeenCalled();
  });

  it("does not throw when reset throws", () => {
    getProperty.mockReturnValue("identified");
    reset.mockImplementation(() => {
      throw new Error("boom");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => resetClientIdentity()).not.toThrow();
  });
});
