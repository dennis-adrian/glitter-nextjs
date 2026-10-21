// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { inflateSync } from "node:zlib";

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  buildPushPayload,
  SENSITIVE_PUSH_BODY,
  SENSITIVE_PUSH_TITLE,
} from "@/app/lib/notifications/push/payload";

const ORIGIN = "https://glitter.test";
const INBOX = "/my_notifications";
const PUBLIC_DIR = path.join(process.cwd(), "public");
const SW_FILE = path.join(PUBLIC_DIR, "sw.js");
/** The file browsers install, as shipped: nothing bundles or transpiles it. */
const SW_SOURCE = readFileSync(SW_FILE, "utf8");

type Listener = (event: Record<string, unknown>) => void;

type FakeWindow = {
  url: string;
  focus: Mock<() => Promise<FakeWindow | null>>;
  navigate?: Mock<(url: string) => Promise<FakeWindow | null>>;
};

/**
 * Chromium lets one tap focus a window or open one, once: a second attempt
 * throws. The fakes keep that rule, so a worker that spends it twice fails.
 */
const windowInteraction = { used: false };

function spendWindowInteraction() {
  if (windowInteraction.used) {
    throw new Error("InvalidAccessError: Not allowed to open a window.");
  }
  windowInteraction.used = true;
}

/** Runs sw.js in a fresh worker global and keeps what it listens for. */
function installWorker() {
  const listeners: Record<string, Listener> = {};
  const self = {
    location: { origin: ORIGIN },
    registration: {
      showNotification: vi.fn<
        (title: string, options: Record<string, unknown>) => Promise<void>
      >(async () => {}),
    },
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn<(options: unknown) => Promise<FakeWindow[]>>(
        async () => [],
      ),
      openWindow: vi.fn<(url: string) => Promise<null>>(async () => {
        spendWindowInteraction();
        return null;
      }),
    },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, listener: Listener) => {
      if (listeners[type]) throw new Error(`sw.js listens for ${type} twice`);
      listeners[type] = listener;
    },
  };
  runInNewContext(SW_SOURCE, { self, URL }, { filename: SW_FILE });
  return { self, listeners };
}

type Worker = ReturnType<typeof installWorker>;

/**
 * Fires an event the way a browser does. The worker has to hand its work to
 * waitUntil before the listener returns, or the browser may stop it midway.
 */
function dispatch(
  worker: Worker,
  type: string,
  event: Record<string, unknown> = {},
) {
  const listener = worker.listeners[type];
  if (!listener) throw new Error(`sw.js does not listen for ${type}`);
  const pending: unknown[] = [];
  listener({
    ...event,
    waitUntil: (promise: unknown) => {
      pending.push(promise);
    },
  });
  return { keptAlive: pending.length, done: Promise.all(pending) };
}

/** What `event.data` holds for a push whose body is `text`. */
function pushData(text: string) {
  return { text: () => text, json: () => JSON.parse(text) as unknown };
}

/** Delivers a push and returns the one notification it showed. */
async function push(worker: Worker, data: ReturnType<typeof pushData> | null) {
  const { keptAlive, done } = dispatch(worker, "push", { data });
  await done;
  expect(keptAlive).toBe(1);
  const shown = worker.self.registration.showNotification.mock.calls;
  expect(shown).toHaveLength(1);
  const [title, options] = shown[0];
  return { title, options };
}

function pushJson(worker: Worker, payload: unknown) {
  return push(worker, pushData(JSON.stringify(payload)));
}

/** A browser tab the worker can see through clients.matchAll. */
function openTab(url: string, overrides: Partial<FakeWindow> = {}) {
  const tab: FakeWindow = {
    url,
    focus: vi.fn(async () => {
      spendWindowInteraction();
      return tab;
    }),
    // Needs no user activation, unlike focusing or opening.
    navigate: vi.fn(async () => tab),
    ...overrides,
  };
  return tab;
}

/** Taps a shown notification while `tabs` are open. */
async function tap(worker: Worker, data: unknown, tabs: FakeWindow[] = []) {
  worker.self.clients.matchAll.mockResolvedValue(tabs);
  windowInteraction.used = false;
  const notification = { data, close: vi.fn() };
  const { keptAlive, done } = dispatch(worker, "notificationclick", {
    notification,
  });
  // Closed at once, before the worker waits on any tab.
  expect(notification.close).toHaveBeenCalledTimes(1);
  await done;
  expect(keptAlive).toBe(1);
  return notification;
}

const ICON = "/icons/glitter-192.png";
const BADGE = "/icons/glitter-badge-96.png";

const VALID_PAYLOAD = {
  v: 1,
  id: 7,
  title: "Tu reserva fue confirmada",
  body: "Te esperamos en el stand B12.",
  url: "/my_notifications/7",
  tag: "notification-7",
};

const GENERIC_NOTIFICATION = {
  title: "Glitter",
  options: {
    body: "Tenés una notificación nueva",
    icon: ICON,
    badge: BADGE,
    lang: "es",
    data: { url: INBOX },
  },
};

let worker: Worker;

beforeEach(() => {
  worker = installWorker();
});

describe("installing a new version of the worker", () => {
  it("takes over as soon as it installs, without waiting for old tabs to close", () => {
    dispatch(worker, "install");
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("claims the open tabs when it activates, and stays alive until it has", async () => {
    const { keptAlive, done } = dispatch(worker, "activate");
    expect(keptAlive).toBe(1);
    await done;
    expect(worker.self.clients.claim).toHaveBeenCalledTimes(1);
  });

  it("never answers page requests, so it cannot serve a stale page", () => {
    expect(Object.keys(worker.listeners).sort()).toEqual([
      "activate",
      "install",
      "notificationclick",
      "push",
    ]);
  });
});

describe("showing a push", () => {
  it("shows the title and text the server sent, with Glitter's icon, in Spanish", async () => {
    expect(await pushJson(worker, VALID_PAYLOAD)).toEqual({
      title: "Tu reserva fue confirmada",
      options: {
        body: "Te esperamos en el stand B12.",
        icon: ICON,
        badge: BADGE,
        lang: "es",
        tag: "notification-7",
        data: { url: "/my_notifications/7" },
      },
    });
  });

  it("shows what the server builds, linking to the item's own page", async () => {
    const payload = buildPushPayload({
      id: 42,
      title: "Recibiste créditos",
      body: "Ya podés usarlos en tu próxima reserva.\n\nNota del equipo.",
      sensitive: false,
      writtenText: false,
    });
    const { title, options } = await push(worker, pushData(payload));
    expect(title).toBe("Recibiste créditos");
    expect(options.body).toBe("Ya podés usarlos en tu próxima reserva.");
    expect(options.tag).toBe("notification-42");
    expect(options.data).toEqual({ url: "/my_notifications/42" });
  });

  it("shows a disciplinary notice as the server worded it for a lock screen", async () => {
    const payload = buildPushPayload({
      id: 9,
      title: "Recibiste una sanción",
      body: "Motivo: llegaste tarde al montaje.",
      sensitive: true,
      writtenText: false,
    });
    const { title, options } = await push(worker, pushData(payload));
    expect(title).toBe(SENSITIVE_PUSH_TITLE);
    expect(options.body).toBe(SENSITIVE_PUSH_BODY);
    expect(options.data).toEqual({ url: "/my_notifications/9" });
  });

  it("names an untitled notification Glitter and keeps its text", async () => {
    const { title, options } = await pushJson(worker, {
      ...VALID_PAYLOAD,
      title: "",
    });
    expect(title).toBe("Glitter");
    expect(options.body).toBe("Te esperamos en el stand B12.");
  });

  it("still shows a notification whose tag is not text, without a tag", async () => {
    const { title, options } = await pushJson(worker, {
      ...VALID_PAYLOAD,
      tag: 7,
    });
    expect(title).toBe("Tu reserva fue confirmada");
    expect(options.tag).toBeUndefined();
  });

  it.each([
    { carrying: "data that is not JSON", data: pushData("{not json") },
    { carrying: "no data at all", data: null },
    { carrying: "a JSON null", data: pushData("null") },
    { carrying: "a bare string", data: pushData('"hola"') },
    {
      carrying: "a payload version it does not know",
      data: pushData(JSON.stringify({ ...VALID_PAYLOAD, v: 2 })),
    },
    {
      carrying: "a version written as text",
      data: pushData(JSON.stringify({ ...VALID_PAYLOAD, v: "1" })),
    },
    {
      carrying: "no title",
      data: pushData(JSON.stringify({ ...VALID_PAYLOAD, title: undefined })),
    },
    {
      carrying: "no body",
      data: pushData(JSON.stringify({ ...VALID_PAYLOAD, body: undefined })),
    },
    {
      carrying: "no link",
      data: pushData(JSON.stringify({ ...VALID_PAYLOAD, url: undefined })),
    },
    {
      carrying: "a link that is not text",
      data: pushData(JSON.stringify({ ...VALID_PAYLOAD, url: 7 })),
    },
  ])(
    "shows a generic notification linking to the inbox for a push carrying $carrying",
    async ({ data }) => {
      expect(await push(worker, data)).toEqual(GENERIC_NOTIFICATION);
    },
  );

  it.each([
    "https://evil.test/x",
    "//evil.test/x",
    "/\\evil.test/x",
    "javascript:alert(1)",
    "data:text/html,hola",
    "http://glitter.test/my_notifications/7",
    "https://glitter.test.evil.test/my_notifications/7",
  ])("links to the inbox instead of %s", async (url) => {
    const { title, options } = await pushJson(worker, {
      ...VALID_PAYLOAD,
      url,
    });
    expect(title).toBe("Tu reserva fue confirmada");
    expect(options.body).toBe("Te esperamos en el stand B12.");
    expect(options.data).toEqual({ url: INBOX });
  });

  it("keeps a full link to Glitter as a path, with its query and anchor", async () => {
    const { options } = await pushJson(worker, {
      ...VALID_PAYLOAD,
      url: `${ORIGIN}/my_notifications/7?from=push#detalle`,
    });
    expect(options.data).toEqual({
      url: "/my_notifications/7?from=push#detalle",
    });
  });
});

describe("tapping a notification", () => {
  it("takes an open Glitter tab to its page, then brings it forward", async () => {
    const tab = openTab(`${ORIGIN}/merch`);
    await tap(worker, { url: "/my_notifications/7" }, [tab]);
    // Only tabs this worker controls can be navigated.
    expect(worker.self.clients.matchAll).toHaveBeenCalledWith({
      type: "window",
    });
    expect(tab.navigate).toHaveBeenCalledWith("/my_notifications/7");
    expect(tab.focus).toHaveBeenCalledTimes(1);
    expect(tab.navigate.mock.invocationCallOrder[0]).toBeLessThan(
      tab.focus.mock.invocationCallOrder[0],
    );
    expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new tab when the open one cannot be navigated", async () => {
    const tab = openTab(`${ORIGIN}/merch`, { navigate: undefined });
    await tap(worker, { url: "/my_notifications/7" }, [tab]);
    // Focusing first would spend the tap, and the new tab would be refused.
    expect(tab.focus).not.toHaveBeenCalled();
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7",
    );
  });

  it("opens a new tab when navigating the open one fails", async () => {
    const tab = openTab(`${ORIGIN}/merch`, {
      navigate: vi.fn(async () => {
        throw new TypeError(
          "This service worker is not the client's active one",
        );
      }),
    });
    await tap(worker, { url: "/my_notifications/7" }, [tab]);
    expect(tab.navigate).toHaveBeenCalledWith("/my_notifications/7");
    expect(tab.focus).not.toHaveBeenCalled();
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7",
    );
  });

  it("keeps the tab it navigated when that tab cannot take focus", async () => {
    const tab = openTab(`${ORIGIN}/merch`, {
      focus: vi.fn(async () => {
        throw new Error("InvalidAccessError");
      }),
    });
    await tap(worker, { url: "/my_notifications/7" }, [tab]);
    expect(tab.navigate).toHaveBeenCalledWith("/my_notifications/7");
    // It already shows the item: a second tab would be a duplicate.
    expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new tab when no Glitter tab is open", async () => {
    await tap(worker, { url: "/my_notifications/7" });
    expect(worker.self.clients.openWindow).toHaveBeenCalledTimes(1);
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7",
    );
  });

  it("leaves tabs of other sites alone", async () => {
    const other = openTab("https://evil.test/inbox");
    await tap(worker, { url: "/my_notifications/7" }, [other]);
    expect(other.focus).not.toHaveBeenCalled();
    expect(other.navigate).not.toHaveBeenCalled();
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7",
    );
  });

  it("finds the Glitter tab among tabs of other sites", async () => {
    const other = openTab("https://evil.test/inbox");
    const ours = openTab(`${ORIGIN}/supplies`);
    await tap(worker, { url: "/my_notifications/7" }, [other, ours]);
    expect(other.focus).not.toHaveBeenCalled();
    expect(ours.navigate).toHaveBeenCalledWith("/my_notifications/7");
    expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it.each(["https://evil.test/x", "//evil.test/x", "javascript:alert(1)", ""])(
    "opens the inbox instead of %j",
    async (url) => {
      const tab = openTab(`${ORIGIN}/merch`);
      await tap(worker, { url }, [tab]);
      expect(tab.navigate).toHaveBeenCalledWith(INBOX);
    },
  );

  it.each([
    { carrying: "no data", data: null },
    { carrying: "data without a link", data: {} },
  ])("opens the inbox for a notification with $carrying", async ({ data }) => {
    await tap(worker, data);
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(INBOX);
  });

  it("opens the page of the notification a push just showed", async () => {
    const { options } = await pushJson(worker, VALID_PAYLOAD);
    await tap(worker, options.data);
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7",
    );
  });
});

/** A PNG's header fields, without decoding its pixels. */
function pngHeader(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii"), file).toBe("PNG");
  expect(bytes.subarray(12, 16).toString("ascii"), file).toBe("IHDR");
  return {
    size: `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,
    bitDepth: bytes[24],
    colorType: bytes[25],
    interlace: bytes[28],
  };
}

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** Every pixel's alpha in an 8-bit, non-interlaced RGBA PNG. */
function pngAlphas(file: string) {
  const bytes = readFileSync(file);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const data: Buffer[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    if (bytes.toString("ascii", at + 4, at + 8) === "IDAT") {
      data.push(bytes.subarray(at + 8, at + 8 + length));
    }
    at += 12 + length;
  }
  const filtered = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const predicted = [
        0,
        left,
        up,
        (left + up) >> 1,
        paeth(left, up, upLeft),
      ][filter];
      pixels[y * stride + x] =
        (filtered[y * (stride + 1) + 1 + x] + predicted) & 0xff;
    }
  }
  return pixels.filter((_, index) => index % 4 === 3);
}

describe("the notification's images", () => {
  it("ships the icon and badge the worker names, at their sizes", async () => {
    const { options } = await pushJson(worker, VALID_PAYLOAD);
    const icon = path.join(PUBLIC_DIR, String(options.icon));
    const badge = path.join(PUBLIC_DIR, String(options.badge));
    expect(existsSync(icon), icon).toBe(true);
    expect(existsSync(badge), badge).toBe(true);
    expect(pngHeader(icon).size).toBe("192x192");
    expect(pngHeader(badge).size).toBe("96x96");
  });

  it("draws the badge on a transparent background, as Android paints only its shape", () => {
    const badge = path.join(PUBLIC_DIR, BADGE);
    const header = pngHeader(badge);
    // Colour type 6 is RGBA: a badge without alpha shows as a solid square.
    expect(header.colorType).toBe(6);
    expect(header.bitDepth).toBe(8);
    expect(header.interlace).toBe(0);
    const alphas = pngAlphas(badge);
    expect(alphas.length).toBe(96 * 96);
    expect(alphas.includes(0)).toBe(true);
    expect(alphas.includes(255)).toBe(true);
  });
});
