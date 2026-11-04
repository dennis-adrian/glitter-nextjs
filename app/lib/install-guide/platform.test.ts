import { describe, expect, it } from "vitest";

import {
  detectInstallContext,
  installPlatformGroup,
} from "@/app/lib/install-guide/platform";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.18.94 (iPhone15,2; iOS 17_4; es_LA; es; scale=3.00; 1179x2556)",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.38.108;FBBV/123]",
  ipadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  androidEdge:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 Instagram 320.0.0.34.109 Android",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macFirefox:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:140.0) Gecko/20100101 Firefox/140.0",
};

function browserWith(
  userAgent: string,
  { standalone = false, touchPoints = 0 } = {},
) {
  return {
    navigator: { userAgent, maxTouchPoints: touchPoints },
    matchMedia: (query: string) => ({
      matches: standalone && query === "(display-mode: standalone)",
    }),
  };
}

describe("detectInstallContext", () => {
  it.each([
    ["iphoneSafari", "ios-safari", "safari"],
    ["iphoneChrome", "ios-browser", "chrome"],
    ["iphoneFirefox", "ios-browser", "firefox"],
    ["iphoneInstagram", "ios-in-app", "other"],
    ["iphoneFacebook", "ios-in-app", "other"],
    ["androidChrome", "android-chromium", "chrome"],
    ["androidSamsung", "android-chromium", "samsung"],
    ["androidEdge", "android-chromium", "edge"],
    ["androidFirefox", "android-firefox", "firefox"],
    ["androidInstagram", "android-in-app", "other"],
    ["androidWebView", "android-in-app", "other"],
    ["windowsChrome", "desktop", "chrome"],
    ["windowsEdge", "desktop", "edge"],
    ["macSafari", "desktop", "safari"],
    ["macFirefox", "desktop", "firefox"],
  ] as const)("reads %s as %s", (name, platform, browser) => {
    expect(detectInstallContext(browserWith(UA[name]))).toEqual({
      platform,
      browser,
    });
  });

  it("tells an iPad, which reports a Mac, apart by its touch screen", () => {
    expect(
      detectInstallContext(browserWith(UA.ipadAsMac, { touchPoints: 5 }))
        .platform,
    ).toBe("ios-safari");
  });

  it("says installed when running from the home screen or an app window", () => {
    expect(
      detectInstallContext(browserWith(UA.androidChrome, { standalone: true }))
        .platform,
    ).toBe("installed");
    expect(
      detectInstallContext({
        navigator: { userAgent: UA.iphoneSafari, standalone: true },
      }).platform,
    ).toBe("installed");
  });

  it("falls back to the generic steps for a browser it does not know", () => {
    expect(detectInstallContext(browserWith("curl/8.0")).platform).toBe(
      "other",
    );
  });
});

describe("installPlatformGroup", () => {
  it("groups platforms for analytics", () => {
    expect(installPlatformGroup("ios-in-app")).toBe("ios");
    expect(installPlatformGroup("android-chromium")).toBe("android");
    expect(installPlatformGroup("desktop")).toBe("desktop");
    expect(installPlatformGroup("installed")).toBe("installed");
    expect(installPlatformGroup("unknown")).toBe("other");
  });
});
