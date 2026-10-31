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
import {
  ARRIVALS_KEPT,
  ARRIVALS_PATH,
  LAST_TAP_PATH,
  NOTIFICATION_STATE_CACHE,
  SW_NOTIFICATION_RECEIVED,
  SW_OPEN,
} from "@/app/lib/notifications/push/taps";

const ORIGIN = "https://glitter.test";
const INBOX = "/my_notifications";
const PUBLIC_DIR = path.join(process.cwd(), "public");
const SW_FILE = path.join(PUBLIC_DIR, "sw.js");
/** The file browsers install, as shipped: nothing bundles or transpiles it. */
const SW_SOURCE = readFileSync(SW_FILE, "utf8");

type Listener = (event: Record<string, unknown>) => void;

/** How a window answers the worker's "will you open this tap?". */
type Answer = "accept" | "decline" | "silent";

type FakeWindow = {
  url: string;
  focused: boolean;
  visibilityState: "visible" | "hidden";
  focus: Mock<() => Promise<FakeWindow | null>>;
  navigate?: Mock<(url: string) => Promise<FakeWindow | null>>;
  postMessage: Mock<(message: unknown, transfer?: MessagePort[]) => void>;
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

/** Cache Storage as the worker uses it: JSON kept under a few paths. */
function fakeCaches() {
  const stores = new Map<string, Map<string, string>>();
  return {
    stores,
    open: vi.fn(async (name: string) => {
      const store = stores.get(name) ?? new Map<string, string>();
      stores.set(name, store);
      return {
        put: async (key: string, response: Response) => {
          store.set(key, await response.text());
        },
        match: async (key: string) =>
          store.has(key) ? new Response(store.get(key)) : undefined,
        delete: async (key: string) => store.delete(key),
      };
    }),
  };
}

/** Runs sw.js in a fresh worker global and keeps what it listens for. */
function installWorker() {
  const listeners: Record<string, Listener> = {};
  const caches = fakeCaches();
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
  runInNewContext(
    SW_SOURCE,
    {
      self,
      URL,
      Response,
      MessageChannel,
      setTimeout,
      clearTimeout,
      caches,
    },
    { filename: SW_FILE },
  );
  return { self, listeners, caches };
}

type Worker = ReturnType<typeof installWorker>;

/** What the worker keeps under `key`, parsed. */
function kept(worker: Worker, key: string): unknown {
  const value = worker.caches.stores.get(NOTIFICATION_STATE_CACHE)?.get(key);
  return value == null ? undefined : JSON.parse(value);
}

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
async function push(
  worker: Worker,
  data: ReturnType<typeof pushData> | null,
  windows: FakeWindow[] = [],
) {
  worker.self.clients.matchAll.mockResolvedValue(windows);
  const { keptAlive, done } = dispatch(worker, "push", { data });
  await done;
  expect(keptAlive).toBe(1);
  const shown = worker.self.registration.showNotification.mock.calls;
  expect(shown).toHaveLength(1);
  const [title, options] = shown[0];
  return { title, options };
}

function pushJson(worker: Worker, payload: unknown, windows?: FakeWindow[]) {
  return push(worker, pushData(JSON.stringify(payload)), windows);
}

/**
 * A Glitter window the worker can see through clients.matchAll: a browser
 * tab, or the installed app. `url` is the page it first loaded, as browsers
 * report it however far the app has navigated since.
 */
function openWindow(
  url: string,
  answer: Answer,
  overrides: Partial<FakeWindow> = {},
) {
  const window: FakeWindow = {
    url,
    focused: false,
    visibilityState: "visible",
    focus: vi.fn(async () => {
      spendWindowInteraction();
      return window;
    }),
    // The worker never navigates a window: it may hold a form.
    navigate: vi.fn(async () => window),
    postMessage: vi.fn((_message: unknown, transfer?: MessagePort[]) => {
      if (answer === "silent") return;
      transfer?.[0]?.postMessage({ accepted: answer === "accept" });
    }),
    ...overrides,
  };
  return window;
}

/** Taps a shown notification while `windows` are open. */
async function tap(worker: Worker, data: unknown, windows: FakeWindow[] = []) {
  worker.self.clients.matchAll.mockResolvedValue(windows);
  windowInteraction.used = false;
  const notification = { data, close: vi.fn() };
  const { keptAlive, done } = dispatch(worker, "notificationclick", {
    notification,
  });
  // Closed at once, before the worker waits on any window.
  expect(notification.close).toHaveBeenCalledTimes(1);
  await done;
  expect(keptAlive).toBe(1);
  return notification;
}

/** The "open this tap" message a window got. */
function openMessage(window: FakeWindow) {
  const [message] = window.postMessage.mock.calls.at(-1) ?? [];
  return message as {
    type: string;
    url: string;
    href: string | null;
    id: number | null;
    tapId: string;
  };
}

const ICON = "/icons/glitter-192.png";
const BADGE = "/icons/glitter-badge-96.png";

const RESERVATION = "/profiles/3/festivals/2/reservations/9";

const VALID_PAYLOAD = {
  v: 1,
  id: 7,
  title: "Tu reserva fue confirmada",
  body: "Te esperamos en el stand B12.",
  url: "/my_notifications/7/open",
  href: RESERVATION,
  tag: "notification-7",
};

const GENERIC_NOTIFICATION = {
  title: "Glitter",
  options: {
    body: "Tenés una notificación nueva",
    icon: ICON,
    badge: BADGE,
    lang: "es",
    data: { url: INBOX, id: null, href: null },
  },
};

const TAP = { url: "/my_notifications/7/open", id: 7, href: RESERVATION };

let worker: Worker;

beforeEach(() => {
  worker = installWorker();
});

describe("the worker and the page", () => {
  it("use the same message and storage names", () => {
    for (const name of [
      SW_OPEN,
      SW_NOTIFICATION_RECEIVED,
      NOTIFICATION_STATE_CACHE,
      LAST_TAP_PATH,
      ARRIVALS_PATH,
    ]) {
      expect(SW_SOURCE).toContain(`"${name}"`);
    }
    expect(SW_SOURCE).toContain(`const ARRIVALS_KEPT = ${ARRIVALS_KEPT};`);
  });
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
        data: { url: "/my_notifications/7/open", id: 7, href: RESERVATION },
      },
    });
  });

  it("shows what the server builds, opening the item as the inbox does", async () => {
    const payload = buildPushPayload({
      id: 42,
      title: "Recibiste créditos",
      body: "Ya podés usarlos en tu próxima reserva.\n\nNota del equipo.",
      sensitive: false,
      writtenText: false,
      href: "/my_credits",
    });
    const { title, options } = await push(worker, pushData(payload));
    expect(title).toBe("Recibiste créditos");
    expect(options.body).toBe("Ya podés usarlos en tu próxima reserva.");
    expect(options.tag).toBe("notification-42");
    expect(options.data).toEqual({
      url: "/my_notifications/42/open",
      id: 42,
      href: "/my_credits",
    });
  });

  it("shows a disciplinary notice as the server worded it for a lock screen", async () => {
    const payload = buildPushPayload({
      id: 9,
      title: "Recibiste una sanción",
      body: "Motivo: llegaste tarde al montaje.",
      sensitive: true,
      writtenText: false,
      href: "/my_notifications/9",
    });
    const { title, options } = await push(worker, pushData(payload));
    expect(title).toBe(SENSITIVE_PUSH_TITLE);
    expect(options.body).toBe(SENSITIVE_PUSH_BODY);
    expect(options.data).toEqual({
      url: "/my_notifications/9/open",
      id: 9,
      href: "/my_notifications/9",
    });
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

  it.each([0, -1, 1.5, "7", null])(
    "keeps no item id for an id like %j",
    async (id) => {
      const { options } = await pushJson(worker, { ...VALID_PAYLOAD, id });
      expect(options.data).toEqual({
        url: "/my_notifications/7/open",
        id: null,
        href: RESERVATION,
      });
    },
  );

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
    expect(options.data).toEqual({ url: INBOX, id: 7, href: RESERVATION });
  });

  it.each([
    { carrying: "a destination off the site", href: "https://evil.test/x" },
    { carrying: "a destination that is not text", href: 7 },
    { carrying: "no destination, from a server before it", href: undefined },
  ])("keeps no destination for a push carrying $carrying", async ({ href }) => {
    const { options } = await pushJson(worker, { ...VALID_PAYLOAD, href });
    expect(options.data).toEqual({
      url: "/my_notifications/7/open",
      id: 7,
      href: null,
    });
  });

  it("keeps a full link to Glitter as a path, with its query and anchor", async () => {
    const { options } = await pushJson(worker, {
      ...VALID_PAYLOAD,
      url: `${ORIGIN}/my_notifications/7?from=push#detalle`,
    });
    expect(options.data).toEqual({
      url: "/my_notifications/7?from=push#detalle",
      id: 7,
      href: RESERVATION,
    });
  });

  it("tells open Glitter windows what arrived, so they refresh their inbox and bell", async () => {
    const app = openWindow(`${ORIGIN}/`, "silent");
    const elsewhere = openWindow("https://evil.test/", "silent");
    await pushJson(worker, VALID_PAYLOAD, [app, elsewhere]);
    expect(app.postMessage).toHaveBeenCalledWith({
      type: SW_NOTIFICATION_RECEIVED,
      arrival: {
        id: 7,
        title: "Tu reserva fue confirmada",
        body: "Te esperamos en el stand B12.",
        url: "/my_notifications/7/open",
        href: RESERVATION,
        at: expect.any(Number),
      },
    });
    expect(elsewhere.postMessage).not.toHaveBeenCalled();
    expect(worker.self.clients.matchAll).toHaveBeenCalledWith({
      type: "window",
      includeUncontrolled: true,
    });
  });

  it("still tells the windows when it cannot keep the arrival", async () => {
    worker.caches.open.mockRejectedValue(new Error("QuotaExceededError"));
    const app = openWindow(`${ORIGIN}/`, "silent");
    await pushJson(worker, VALID_PAYLOAD, [app]);
    expect(app.postMessage).toHaveBeenCalledTimes(1);
  });

  it(`keeps the last ${ARRIVALS_KEPT} arrivals, for a page in the background to offer when it returns`, async () => {
    for (let id = 1; id <= ARRIVALS_KEPT + 1; id += 1) {
      worker.self.registration.showNotification.mockClear();
      await pushJson(worker, {
        ...VALID_PAYLOAD,
        id,
        title: `Notificación ${id}`,
        url: `/my_notifications/${id}/open`,
      });
    }
    const arrivals = kept(worker, ARRIVALS_PATH) as Array<{
      id: number;
      title: string;
      body: string;
      url: string;
      at: number;
    }>;
    expect(arrivals.map((arrival) => arrival.id)).toEqual([2, 3, 4, 5, 6]);
    expect(arrivals[4]).toMatchObject({
      title: "Notificación 6",
      body: "Te esperamos en el stand B12.",
      url: "/my_notifications/6/open",
    });
    expect(typeof arrivals[4]?.at).toBe("number");
  });

  it("keeps a retried push once, as the latest", async () => {
    for (const payload of [
      VALID_PAYLOAD,
      { ...VALID_PAYLOAD, id: 8, url: "/my_notifications/8/open" },
      VALID_PAYLOAD,
    ]) {
      worker.self.registration.showNotification.mockClear();
      await pushJson(worker, payload);
    }
    const arrivals = kept(worker, ARRIVALS_PATH) as Array<{ id: number }>;
    expect(arrivals.map((arrival) => arrival.id)).toEqual([8, 7]);
  });

  it("keeps both of two pushes handled at once", async () => {
    const first = dispatch(worker, "push", {
      data: pushData(JSON.stringify(VALID_PAYLOAD)),
    });
    const second = dispatch(worker, "push", {
      data: pushData(
        JSON.stringify({
          ...VALID_PAYLOAD,
          id: 8,
          url: "/my_notifications/8/open",
        }),
      ),
    });
    await Promise.all([first.done, second.done]);
    const arrivals = kept(worker, ARRIVALS_PATH) as Array<{ id: number }>;
    expect(arrivals.map((arrival) => arrival.id).sort()).toEqual([7, 8]);
  });

  it("still shows the notification when telling the windows fails", async () => {
    worker.self.clients.matchAll.mockRejectedValue(new Error("gone"));
    const { keptAlive, done } = dispatch(worker, "push", {
      data: pushData(JSON.stringify(VALID_PAYLOAD)),
    });
    await done;
    expect(keptAlive).toBe(1);
    expect(worker.self.registration.showNotification).toHaveBeenCalledTimes(1);
  });
});

describe("tapping a notification", () => {
  it("lets the installed app open it itself, whatever page it first loaded", async () => {
    // The app opened at "/" and has navigated since; browsers still report "/".
    const app = openWindow(`${ORIGIN}/`, "accept");
    await tap(worker, TAP, [app]);

    expect(openMessage(app)).toMatchObject({
      type: SW_OPEN,
      url: "/my_notifications/7/open",
      href: RESERVATION,
      id: 7,
    });
    expect(typeof openMessage(app).tapId).toBe("string");
    expect(app.focus).toHaveBeenCalledTimes(1);
    expect(app.navigate).not.toHaveBeenCalled();
    expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
    // A page loaded before this worker took over can still be asked.
    expect(worker.self.clients.matchAll).toHaveBeenCalledWith({
      type: "window",
      includeUncontrolled: true,
    });
  });

  it("still counts as opened when the app cannot take focus", async () => {
    const app = openWindow(`${ORIGIN}/`, "accept", {
      focus: vi.fn(async () => {
        throw new TypeError("WindowClient focus failed");
      }),
    });
    await tap(worker, TAP, [app]);
    expect(app.navigate).not.toHaveBeenCalled();
    expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window rather than take away a tab that declines, so a form there is not lost", async () => {
    const tab = openWindow(`${ORIGIN}/dashboard/festivals/3/edit`, "decline");
    await tap(worker, TAP, [tab]);
    expect(tab.navigate).not.toHaveBeenCalled();
    // Focusing first would spend the one window Chromium allows per tap.
    expect(tab.focus).not.toHaveBeenCalled();
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7/open",
    );
  });

  it("leaves a window that does not answer in time as it is, and opens the link in a new one", async () => {
    // Asleep or frozen in the background, it may hold a form half filled.
    const asleep = openWindow(
      `${ORIGIN}/dashboard/festivals/3/edit`,
      "silent",
      {
        visibilityState: "hidden",
      },
    );
    await tap(worker, TAP, [asleep]);
    expect(asleep.navigate).not.toHaveBeenCalled();
    expect(asleep.focus).not.toHaveBeenCalled();
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7/open",
    );
  });

  it("brings Glitter forward when it may not open a window", async () => {
    const asleep = openWindow(`${ORIGIN}/`, "silent");
    worker.self.clients.openWindow.mockRejectedValue(
      new Error("InvalidAccessError"),
    );
    await tap(worker, TAP, [asleep]);
    expect(asleep.focus).toHaveBeenCalledTimes(1);
    expect(asleep.navigate).not.toHaveBeenCalled();
  });

  it("treats a window it cannot write to as one that did not answer", async () => {
    const broken = openWindow(`${ORIGIN}/`, "accept", {
      postMessage: vi.fn(() => {
        throw new Error("DataCloneError");
      }),
    });
    await tap(worker, TAP, [broken]);
    expect(broken.navigate).not.toHaveBeenCalled();
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7/open",
    );
  });

  it("opens a window when no Glitter window is open", async () => {
    await tap(worker, TAP);
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7/open",
    );
  });

  it("leaves windows of other sites alone", async () => {
    const other = openWindow("https://evil.test/my_notifications", "accept");
    await tap(worker, TAP, [other]);
    expect(other.postMessage).not.toHaveBeenCalled();
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7/open",
    );
  });

  it("asks the focused Glitter window first, then a visible one", async () => {
    const hidden = openWindow(`${ORIGIN}/a`, "accept", {
      visibilityState: "hidden",
    });
    const visible = openWindow(`${ORIGIN}/b`, "accept");
    const focused = openWindow(`${ORIGIN}/c`, "accept", { focused: true });
    await tap(worker, TAP, [hidden, visible, focused]);
    expect(focused.postMessage).toHaveBeenCalledTimes(1);
    expect(visible.postMessage).not.toHaveBeenCalled();

    const again = installWorker();
    await tap(again, TAP, [hidden, visible]);
    expect(visible.postMessage).toHaveBeenCalledTimes(1);
    expect(hidden.postMessage).not.toHaveBeenCalled();
  });

  it("keeps the tap for the page, in case the device opens Glitter without going to it", async () => {
    await tap(worker, TAP);
    expect(kept(worker, LAST_TAP_PATH)).toMatchObject({
      id: 7,
      url: "/my_notifications/7/open",
      href: RESERVATION,
    });
    const stored = kept(worker, LAST_TAP_PATH) as { tapId: string; at: number };
    expect(typeof stored.tapId).toBe("string");
    expect(typeof stored.at).toBe("number");
  });

  it.each([
    "https://evil.test/x",
    "//evil.test/x",
    "javascript:alert(1)",
    "",
    // Same origin until the path resolves as "//evil.test".
    "/.//evil.test/x",
    "/%2e//evil.test/x",
    "/a/..//evil.test/x",
    `${ORIGIN}//evil.test/x`,
  ])("opens the inbox instead of %j", async (url) => {
    const app = openWindow(`${ORIGIN}/`, "accept");
    await tap(worker, { url, id: 7 }, [app]);
    expect(openMessage(app).url).toBe(INBOX);
  });

  it.each([
    { carrying: "no data", data: null },
    { carrying: "data without a link", data: {} },
  ])("opens the inbox for a notification with $carrying", async ({ data }) => {
    await tap(worker, data);
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(INBOX);
  });

  it("opens the notification a push just showed", async () => {
    const { options } = await pushJson(worker, VALID_PAYLOAD);
    await tap(worker, options.data);
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
      "/my_notifications/7/open",
    );
    expect(kept(worker, LAST_TAP_PATH)).toMatchObject({ id: 7 });
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
