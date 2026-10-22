// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  isAllowedPushEndpoint,
  pushEndpointHost,
} from "@/app/lib/notifications/push/endpoint";

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/dXw7:APA91bHk-_AbC",
    "https://fcm.googleapis.com/wp/dXw7AbC",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk",
    "https://web.push.apple.com/QGuQyavXutnMHlYq",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB%2bC%3d",
  ])("accepts a real push service endpoint: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    // Parsed by the WHATWG URL as one host, by Node's legacy url.parse (which
    // web-push sends with) as the part before the punctuation.
    "https://127.0.0.1;.fcm.googleapis.com/fcm/send/x",
    "https://169.254.169.254'.push.apple.com/x",
    "https://localhost`.notify.windows.com/w/?token=a",
    'https://evil.example".push.apple.com/x',
    "https://evil.example{.push.apple.com/x",
    "https://evil.example}.push.apple.com/x",
    "https://evil.example;.fcm.googleapis.com/x",
  ])("refuses a host the two URL parsers read differently: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it.each([
    ["plain http", "http://fcm.googleapis.com/fcm/send/x"],
    ["another site", "https://evil.example/fcm/send/x"],
    ["a lookalike suffix", "https://fcm.googleapis.com.evil.example/x"],
    ["an invented FCM subdomain", "https://evil.fcm.googleapis.com/x"],
    ["a bare suffix", "https://push.apple.com/x"],
    ["a port", "https://fcm.googleapis.com:8443/fcm/send/x"],
    ["credentials", "https://user:pass@fcm.googleapis.com/x"],
    ["an IP address", "https://10.0.0.1/x"],
    ["an IPv6 address", "https://[::1]/x"],
    ["uppercase", "https://FCM.googleapis.com/x"],
    ["a backslash", "https://fcm.googleapis.com\\@evil.example/x"],
    ["whitespace", "https://fcm.googleapis.com/x y"],
    ["a trailing dot", "https://fcm.googleapis.com./x"],
    ["something not a URL", "fcm.googleapis.com/x"],
  ])("refuses %s", (_, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it("refuses an endpoint past the length cap, and anything not a string", () => {
    expect(
      isAllowedPushEndpoint(`https://fcm.googleapis.com/${"a".repeat(1100)}`),
    ).toBe(false);
    expect(isAllowedPushEndpoint(null)).toBe(false);
    expect(isAllowedPushEndpoint(42)).toBe(false);
  });
});

describe("pushEndpointHost", () => {
  it("names the push service for logs, never the endpoint", () => {
    expect(
      pushEndpointHost("https://web.push.apple.com/QGuQyavXutnMHlYq"),
    ).toBe("web.push.apple.com");
  });

  it("says invalid rather than echoing a hostile host", () => {
    expect(pushEndpointHost("https://127.0.0.1;.fcm.googleapis.com/x")).toBe(
      "invalid",
    );
    expect(pushEndpointHost("not a url")).toBe("invalid");
  });
});
