import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "@/app/lib/impersonation/same-origin";

function req(url: string, headers: Record<string, string>) {
  return new Request(url, { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  it.each([
    [
      "the page's own origin",
      "https://www.glitter.com.bo/x",
      { origin: "https://www.glitter.com.bo", host: "www.glitter.com.bo" },
    ],
    [
      "behind a proxy that rewrote the URL",
      "http://10.0.0.5:3000/x",
      {
        origin: "https://www.glitter.com.bo",
        host: "10.0.0.5:3000",
        "x-forwarded-host": "www.glitter.com.bo",
      },
    ],
    [
      "a LAN visit",
      "http://localhost:3000/x",
      { origin: "http://192.168.1.20:3000", host: "192.168.1.20:3000" },
    ],
    [
      "no Origin header",
      "https://www.glitter.com.bo/x",
      { host: "www.glitter.com.bo" },
    ],
    [
      "a same-site fetch",
      "https://www.glitter.com.bo/x",
      {
        origin: "https://www.glitter.com.bo",
        host: "www.glitter.com.bo",
        "sec-fetch-site": "same-origin",
      },
    ],
  ])("accepts %s", (_, url, headers) => {
    expect(isSameOriginRequest(req(url, headers))).toBe(true);
  });

  it.each([
    [
      "another site",
      { origin: "https://evil.example", host: "www.glitter.com.bo" },
    ],
    [
      "a sandboxed page (null origin)",
      { origin: "null", host: "www.glitter.com.bo" },
    ],
    [
      "a cross-site fetch without Origin",
      { "sec-fetch-site": "cross-site", host: "www.glitter.com.bo" },
    ],
    [
      "a look-alike host",
      {
        origin: "https://www.glitter.com.bo.evil.example",
        host: "www.glitter.com.bo",
      },
    ],
    ["a malformed Origin", { origin: "not a url", host: "www.glitter.com.bo" }],
  ])("refuses %s", (_, headers) => {
    expect(
      isSameOriginRequest(req("https://www.glitter.com.bo/x", headers)),
    ).toBe(false);
  });
});
