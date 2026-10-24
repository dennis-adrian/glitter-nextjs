// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forgetNotificationState,
  NOTIFICATION_STATE_CACHE,
  OPENED_NOTIFICATION_COOKIE,
  openedNotificationId,
  parseArrivals,
  parseKeptTap,
  sitePath,
} from "@/app/lib/notifications/push/taps";

describe("sitePath", () => {
  it.each(["/my_credits", "/my_notifications/41/open?x=1#y"])(
    "keeps %s",
    (path) => {
      expect(sitePath(path)).toBe(path);
    },
  );

  it.each([
    "//evil.test",
    "/\\evil.test",
    "https://evil.test/",
    "my_credits",
    "",
    7,
    null,
  ])("refuses %j", (value) => {
    expect(sitePath(value)).toBeNull();
  });
});

describe("parseKeptTap", () => {
  const tap = {
    id: 41,
    url: "/my_notifications/41/open",
    href: "/my_notifications/41",
    tapId: "abc",
    at: 1_700_000_000_000,
  };

  it("reads what the worker kept", () => {
    expect(parseKeptTap(tap)).toEqual(tap);
  });

  it("keeps a tap without an item id, with none", () => {
    expect(parseKeptTap({ ...tap, id: "41" })).toEqual({ ...tap, id: null });
  });

  it.each([undefined, "//evil.test", 7])(
    "keeps a tap whose destination is %j, with none",
    (href) => {
      expect(parseKeptTap({ ...tap, href })).toEqual({ ...tap, href: null });
    },
  );

  it.each([
    null,
    "tap",
    { ...tap, url: "//evil.test" },
    { ...tap, tapId: 7 },
    { ...tap, at: "now" },
  ])("refuses %j", (value) => {
    expect(parseKeptTap(value)).toBeNull();
  });
});

describe("parseArrivals", () => {
  const arrival = {
    id: 41,
    title: "Recibiste créditos",
    body: "Ya están en tu billetera.",
    url: "/my_notifications/41/open",
    href: "/my_notifications/41",
    at: 1,
  };

  it("keeps the well-formed ones", () => {
    expect(
      parseArrivals([
        arrival,
        { ...arrival, url: "https://evil.test" },
        { ...arrival, title: 3 },
        null,
        { ...arrival, body: undefined, id: 0, href: "https://evil.test" },
      ]),
    ).toEqual([arrival, { ...arrival, body: "", id: null, href: null }]);
  });

  it("reads anything else as none", () => {
    expect(parseArrivals({ arrival })).toEqual([]);
  });
});

describe("openedNotificationId", () => {
  it("reads the id the open route left", () => {
    expect(
      openedNotificationId(`theme=dark; ${OPENED_NOTIFICATION_COOKIE}=41; x=1`),
    ).toBe(41);
  });

  it.each([
    "",
    "theme=dark",
    `${OPENED_NOTIFICATION_COOKIE}=abc`,
    `${OPENED_NOTIFICATION_COOKIE}=`,
  ])("is null for %j", (cookies) => {
    expect(openedNotificationId(cookies)).toBeNull();
  });
});

describe("forgetNotificationState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops what the worker kept", async () => {
    const remove = vi.fn(async () => true);
    vi.stubGlobal("caches", { delete: remove });
    await forgetNotificationState();
    expect(remove).toHaveBeenCalledWith(NOTIFICATION_STATE_CACHE);
  });

  it("does nothing where storage is blocked or missing", async () => {
    vi.stubGlobal("caches", {
      delete: vi.fn(async () => {
        throw new Error("SecurityError");
      }),
    });
    await expect(forgetNotificationState()).resolves.toBeUndefined();
    vi.stubGlobal("caches", undefined);
    await expect(forgetNotificationState()).resolves.toBeUndefined();
  });
});
