import { readFileSync } from "node:fs";
import path from "node:path";
import { Suspense, use, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";

import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const envLabel = vi.hoisted(() => ({ value: "" }));

vi.mock("@/app/lib/config", () => ({
  getEnvLabel: () => envLabel.value,
}));

// The root layout's providers and sections, reduced to what matters here:
// Clerk's provider and the navbar wait for data before they render.
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => (
    <WaitsForData>{children}</WaitsForData>
  ),
}));
vi.mock("@clerk/localizations", () => ({ esMX: {} }));
vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));
vi.mock("@/app/components/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/app/components/providers/posthog-identify", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/ui/fonts", () => ({
  figtree: { variable: "" },
  gabarito: { variable: "" },
}));
vi.mock("@/app/components/credit_gifts/credit-gift-celebration", () => ({
  default: () => null,
}));
vi.mock("@/app/components/navbar/navbar", () => ({
  default: () => <WaitsForData>{null}</WaitsForData>,
}));
vi.mock("@/app/components/footer-server", () => ({ default: () => null }));
// A client component with server actions and the router; renders nothing.
vi.mock("@/app/components/notifications/service-worker-messages", () => ({
  default: () => null,
}));

import InstalledAppHead from "@/app/components/installed-app-head";
import RootLayout from "@/app/layout";
import { LAUNCH_SCREENS } from "@/app/lib/launch-screens";
import { ICON_BACKGROUND } from "@/app/lib/theme-colors";

/** Renders its children only after a wait, as a data fetch does. */
function WaitsForData({ children }: { children: ReactNode }) {
  use(new Promise(() => {}));
  return children;
}

/**
 * The <head> of the first bytes React sends for this document: everything
 * outside the sections still waiting for data, as a browser first gets it.
 */
async function shellHead(document: ReactNode) {
  const stream = await renderToReadableStream(document, {
    // Reading stops at the shell, which aborts the waiting sections.
    onError: () => undefined,
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";
  while (!html.includes("<body")) {
    const { value, done } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  await reader.cancel();
  return new DOMParser().parseFromString(html, "text/html").head;
}

/** These tags first in <body>, as the root layout renders them. */
function documentHead() {
  return shellHead(
    <html lang="es">
      <body>
        <InstalledAppHead />
        <Suspense fallback={<div />}>
          <WaitsForData>{null}</WaitsForData>
        </Suspense>
      </body>
    </html>,
  );
}

/** Width and height from a PNG's header, without decoding it. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii"), file).toBe("PNG");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("InstalledAppHead", () => {
  beforeEach(() => {
    envLabel.value = "";
  });

  it("puts the manifest in <head>, where browsers look for it", async () => {
    const head = await documentHead();
    const links = head.querySelectorAll('link[rel="manifest"]');
    expect(links).toHaveLength(1);
    // Where Next serves app/manifest.ts.
    expect(links[0].getAttribute("href")).toBe("/manifest.webmanifest");
    // A preview behind Vercel's login serves it only with cookies.
    expect(links[0].getAttribute("crossorigin")).toBe("use-credentials");
  });

  it("misses <head> when rendered under something that waits for data, as Next's streamed metadata does", async () => {
    const head = await shellHead(
      <html lang="es">
        <body>
          <Suspense fallback={<div />}>
            <WaitsForData>
              <InstalledAppHead />
            </WaitsForData>
          </Suspense>
        </body>
      </html>,
    );
    expect(head.querySelectorAll('link[rel="manifest"]')).toHaveLength(0);
  });

  it("gives iPhones a 180 px home-screen icon on the brand purple", async () => {
    const head = await documentHead();
    const icon = head.querySelector('link[rel="apple-touch-icon"]');
    const file = path.join(
      process.cwd(),
      "public",
      icon?.getAttribute("href") ?? "",
    );
    expect(icon?.getAttribute("sizes")).toBe("180x180");
    expect(pngSize(file)).toBe("180x180");
    // iOS paints anything transparent black.
    const { data, info } = await sharp(file)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect(`#${data.toString("hex")}`).toBe(ICON_BACKGROUND);
  });

  it("opens full screen on iPhones, under Glitter's name", async () => {
    const head = await documentHead();
    const meta = (name: string) =>
      head.querySelector(`meta[name="${name}"]`)?.getAttribute("content");
    expect(meta("apple-mobile-web-app-capable")).toBe("yes");
    expect(meta("mobile-web-app-capable")).toBe("yes");
    expect(meta("apple-mobile-web-app-title")).toBe("Glitter");
    expect(meta("apple-mobile-web-app-status-bar-style")).toBe("default");
  });

  it("names a staging install after its environment", async () => {
    envLabel.value = "[Prev]";
    const head = await documentHead();
    expect(
      head
        .querySelector('meta[name="apple-mobile-web-app-title"]')
        ?.getAttribute("content"),
    ).toBe("[Prev] Glitter");
  });

  it("offers every launch screen, each for its own screen size", async () => {
    const head = await documentHead();
    const links = [
      ...head.querySelectorAll('link[rel="apple-touch-startup-image"]'),
    ].map((link) => ({
      url: link.getAttribute("href"),
      media: link.getAttribute("media"),
    }));
    expect(links).toEqual(
      LAUNCH_SCREENS.map(({ url, media }) => ({ url, media })),
    );
  });
});

describe("the root layout", () => {
  it("sends the install tags in <head> before anything that waits for data", async () => {
    const head = await shellHead(<RootLayout>{null}</RootLayout>);
    expect(head.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
    expect(head.querySelectorAll('link[rel="apple-touch-icon"]')).toHaveLength(
      1,
    );
    expect(
      head.querySelectorAll('link[rel="apple-touch-startup-image"]'),
    ).toHaveLength(LAUNCH_SCREENS.length);
  });
});
