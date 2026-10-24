// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
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
    tapId: "abc",
    at: 1_700_000_000_000,
  };

  it("reads what the worker kept", () => {
    expect(parseKeptTap(tap)).toEqual(tap);
  });

  it("keeps a tap without an item id, with none", () => {
    expect(parseKeptTap({ ...tap, id: "41" })).toEqual({ ...tap, id: null });
  });

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
    at: 1,
  };

  it("keeps the well-formed ones", () => {
    expect(
      parseArrivals([
        arrival,
        { ...arrival, url: "https://evil.test" },
        { ...arrival, title: 3 },
        null,
        { ...arrival, body: undefined, id: 0 },
      ]),
    ).toEqual([arrival, { ...arrival, body: "", id: null }]);
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
