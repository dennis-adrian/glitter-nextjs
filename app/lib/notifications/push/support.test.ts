// @vitest-environment node
import { createECDH } from "crypto";
import { describe, expect, it } from "vitest";

import {
  detectPushSupport,
  pushDeviceLabel,
  subscribedWithKey,
  urlBase64ToUint8Array,
} from "@/app/lib/notifications/push/support";

const UA = {
  iphone17:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphone16_3:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 321.0.2.20.105",
  ipadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  macFirefox:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};

function browser({
  userAgent = UA.android,
  maxTouchPoints = 0,
  standalone = false,
  permission = "default",
  push = true,
}: {
  userAgent?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  permission?: string;
  push?: boolean;
} = {}) {
  return {
    navigator: {
      userAgent,
      maxTouchPoints,
      serviceWorker: push ? {} : undefined,
    },
    matchMedia: (query: string) => ({
      matches: standalone && query === "(display-mode: standalone)",
    }),
    PushManager: push ? function PushManager() {} : undefined,
    Notification: push ? { permission } : undefined,
  };
}

describe("detectPushSupport", () => {
  it("reads the permission where push works", () => {
    expect(detectPushSupport(browser())).toBe("default");
    expect(detectPushSupport(browser({ permission: "granted" }))).toBe(
      "granted",
    );
    expect(detectPushSupport(browser({ permission: "denied" }))).toBe("denied");
  });

  it("says unsupported where the browser has no Push API", () => {
    expect(detectPushSupport(browser({ push: false }))).toBe("unsupported");
  });

  it("asks an iPhone in a Safari tab to add Glitter to the home screen", () => {
    // Safari tabs have no Push API at all: the platform decides, not the APIs.
    expect(
      detectPushSupport(browser({ userAgent: UA.iphone17, push: false })),
    ).toBe("ios-needs-install");
  });

  it("works on an iPhone once Glitter opens from the home screen", () => {
    expect(
      detectPushSupport(browser({ userAgent: UA.iphone17, standalone: true })),
    ).toBe("default");
  });

  it("tells an iPad apart from a Mac by its touch screen", () => {
    expect(
      detectPushSupport(
        browser({ userAgent: UA.ipadOs, maxTouchPoints: 5, push: false }),
      ),
    ).toBe("ios-needs-install");
    expect(detectPushSupport(browser({ userAgent: UA.macSafari }))).toBe(
      "default",
    );
  });

  it("explains iOS before 16.4, and Instagram's browser, instead of install steps", () => {
    expect(
      detectPushSupport(browser({ userAgent: UA.iphone16_3, push: false })),
    ).toBe("ios-outdated");
    expect(
      detectPushSupport(browser({ userAgent: UA.instagram, push: false })),
    ).toBe("ios-in-app-browser");
  });
});

describe("pushDeviceLabel", () => {
  it("names a device the way its owner would", () => {
    expect(pushDeviceLabel({ userAgent: UA.iphone17 })).toBe("iPhone");
    expect(pushDeviceLabel({ userAgent: UA.ipadOs, maxTouchPoints: 5 })).toBe(
      "iPad",
    );
    expect(pushDeviceLabel({ userAgent: UA.android })).toBe(
      "Chrome en Android",
    );
    expect(pushDeviceLabel({ userAgent: UA.windowsEdge })).toBe(
      "Edge en Windows",
    );
    expect(pushDeviceLabel({ userAgent: UA.macFirefox })).toBe(
      "Firefox en Mac",
    );
    expect(pushDeviceLabel({ userAgent: UA.macSafari })).toBe("Safari en Mac");
    expect(pushDeviceLabel({ userAgent: "" })).toBe("Navegador");
  });
});

describe("subscription keys", () => {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const publicKey = ecdh.getPublicKey().toString("base64url");

  it("decodes the VAPID key into the bytes the browser subscribes with", () => {
    expect(Buffer.from(urlBase64ToUint8Array(publicKey))).toEqual(
      ecdh.getPublicKey(),
    );
  });

  it("knows a subscription made with another key", () => {
    const other = createECDH("prime256v1");
    other.generateKeys();
    const bytes = (key: Buffer) =>
      key.buffer.slice(key.byteOffset, key.byteOffset + key.length);

    expect(subscribedWithKey(bytes(ecdh.getPublicKey()), publicKey)).toBe(true);
    expect(subscribedWithKey(bytes(other.getPublicKey()), publicKey)).toBe(
      false,
    );
    expect(subscribedWithKey(null, publicKey)).toBe(false);
  });
});
