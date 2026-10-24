import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: toastMock }));

import { onNotificationsChanged } from "@/app/components/notifications/notification-events";
import ServiceWorkerMessages, {
  pageLoad,
} from "@/app/components/notifications/service-worker-messages";
import {
  SENSITIVE_PUSH_BODY,
  SENSITIVE_PUSH_TITLE,
  WRITTEN_TEXT_PUSH_BODY,
} from "@/app/lib/notifications/push/payload";
import {
  ARRIVALS_KEPT,
  ARRIVALS_PATH,
  LAST_TAP_PATH,
  NOTIFICATION_STATE_CACHE,
  OPENED_NOTIFICATION_COOKIE,
  SW_NOTIFICATION_RECEIVED,
  SW_OPEN,
} from "@/app/lib/notifications/push/taps";

/** Stands in for `navigator.serviceWorker`, as far as the listener uses it. */
class FakeContainer extends EventTarget {
  startMessages = vi.fn();
}

/** Cache Storage, holding what the worker keeps for the page. */
let store: Map<string, string>;
/** Whether the worker has made its cache yet; reading must not make it. */
let cacheExists: boolean;
let container: FakeContainer;
/** The display mode an installed app reports, on any platform. */
let standalone = false;
let assign: ReturnType<typeof vi.spyOn>;

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
}

/** Glitter added to an iPhone's home screen. */
function iPhoneApp() {
  setUserAgent(IPHONE);
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value: true,
  });
  standalone = true;
}

/** Glitter installed as an app on a computer: standalone, not an iPhone. */
function desktopApp() {
  setUserAgent(DESKTOP_CHROME);
  standalone = true;
}
/** Every test's taps get their own ids: the page remembers opened ones. */
let tapCount = 0;

function newTapId() {
  tapCount += 1;
  return `tap-${tapCount}`;
}

function keep(key: string, value: unknown) {
  cacheExists = true;
  store.set(key, JSON.stringify(value));
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Lets the cache reads, and React, catch up. */
async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(() => {
  store = new Map();
  cacheExists = false;
  vi.stubGlobal("caches", {
    match: vi.fn(async (key: string, options?: { cacheName?: string }) => {
      expect(options?.cacheName).toBe(NOTIFICATION_STATE_CACHE);
      return store.has(key) ? new Response(store.get(key)) : undefined;
    }),
    has: vi.fn(
      async (name: string) => cacheExists && name === NOTIFICATION_STATE_CACHE,
    ),
    open: vi.fn(async (name: string) => {
      expect(name).toBe(NOTIFICATION_STATE_CACHE);
      cacheExists = true;
      return {
        match: async (key: string) =>
          store.has(key) ? new Response(store.get(key)) : undefined,
        delete: async (key: string) => store.delete(key),
      };
    }),
  });
  container = new FakeContainer();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: container,
  });
  standalone = false;
  setUserAgent(DESKTOP_CHROME);
  delete (navigator as unknown as Record<string, unknown>).standalone;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: standalone && query === "(display-mode: standalone)",
  }));
  window.history.pushState({}, "", "/");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.cookie = `${OPENED_NOTIFICATION_COOKIE}=; max-age=0; path=/`;
  assign = vi.spyOn(pageLoad, "assign").mockImplementation(() => {});
  toastMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  delete (navigator as unknown as Record<string, unknown>).standalone;
  delete (navigator as unknown as Record<string, unknown>).userAgent;
});

/** Sends one message from the worker; resolves with the page's answer. */
async function send(data: unknown) {
  const channel = new MessageChannel();
  const answered = new Promise((resolve) => {
    channel.port1.onmessage = (event) => resolve(event.data);
    setTimeout(() => resolve(undefined), 50);
  });
  act(() => {
    container.dispatchEvent(
      new MessageEvent("message", { data, ports: [channel.port2] }),
    );
  });
  const answer = await answered;
  channel.port1.close();
  return answer;
}

function openMessage(url: unknown = "/my_notifications/41/open") {
  return { type: SW_OPEN, url, id: 41, tapId: newTapId() };
}

describe("messages from the worker", () => {
  it("starts taking them once it listens", async () => {
    render(<ServiceWorkerMessages />);
    await settle();
    expect(container.startMessages).toHaveBeenCalledTimes(1);
  });

  it("refreshes the inbox and the bell when a notification arrives", async () => {
    render(<ServiceWorkerMessages />);
    await settle();
    const changed = vi.fn();
    const unsubscribe = onNotificationsChanged(changed);
    await send({ type: SW_NOTIFICATION_RECEIVED });
    unsubscribe();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("opens a tap in the iPhone app, whatever page it is on", async () => {
    iPhoneApp();
    window.history.pushState({}, "", "/festivals/3");
    render(<ServiceWorkerMessages />);
    await settle();

    expect(await send(openMessage())).toEqual({ accepted: true });
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
  });

  it("opens it in a window that is already in the inbox", async () => {
    window.history.pushState({}, "", "/my_notifications");
    render(<ServiceWorkerMessages />);
    await settle();

    expect(await send(openMessage())).toEqual({ accepted: true });
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
  });

  it("leaves a browser tab on another page alone, so a form there is not lost", async () => {
    window.history.pushState({}, "", "/dashboard/festivals/3/edit");
    render(<ServiceWorkerMessages />);
    await settle();

    expect(await send(openMessage())).toEqual({ accepted: false });
    expect(assign).not.toHaveBeenCalled();
  });

  it("leaves an app installed on a computer alone too, where a new window opens instead", async () => {
    desktopApp();
    window.history.pushState({}, "", "/dashboard/festivals/3/edit");
    render(<ServiceWorkerMessages />);
    await settle();

    expect(await send(openMessage())).toEqual({ accepted: false });
    expect(assign).not.toHaveBeenCalled();
  });

  it("opens one tap once, however many times it is asked", async () => {
    iPhoneApp();
    render(<ServiceWorkerMessages />);
    await settle();
    const message = openMessage();

    expect(await send(message)).toEqual({ accepted: true });
    expect(await send(message)).toEqual({ accepted: true });
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it.each(["//evil.test/x", "/\\evil.test", "https://evil.test/", 42, null])(
    "never follows %s",
    async (url) => {
      iPhoneApp();
      render(<ServiceWorkerMessages />);
      await settle();

      expect(await send(openMessage(url))).toEqual({ accepted: false });
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it("declines a tap without an id to tell it apart", async () => {
    iPhoneApp();
    render(<ServiceWorkerMessages />);
    await settle();
    expect(
      await send({ type: SW_OPEN, url: "/my_notifications/41/open" }),
    ).toEqual({ accepted: false });
    expect(assign).not.toHaveBeenCalled();
  });

  it("ignores messages it does not know", async () => {
    iPhoneApp();
    render(<ServiceWorkerMessages />);
    await settle();
    expect(await send({ type: "other", url: "/x" })).toBeUndefined();
    expect(assign).not.toHaveBeenCalled();
  });

  it("does nothing where service workers do not exist", () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    expect(() => render(<ServiceWorkerMessages />)).not.toThrow();
  });

  it("makes no cache on a browser where the worker kept nothing", async () => {
    render(<ServiceWorkerMessages />);
    await settle();
    setVisibility("hidden");
    setVisibility("visible");
    await settle();
    expect(caches.open).not.toHaveBeenCalled();
    expect(cacheExists).toBe(false);
  });
});

describe("a tap the device did not deliver", () => {
  function keepTap(overrides: Record<string, unknown> = {}) {
    keep(LAST_TAP_PATH, {
      id: 41,
      url: "/my_notifications/41/open",
      tapId: newTapId(),
      at: Date.now(),
      ...overrides,
    });
  }

  it("is finished when the iPhone app opens at its start page instead", async () => {
    iPhoneApp();
    keepTap();
    render(<ServiceWorkerMessages />);
    await settle();
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
    expect(store.has(LAST_TAP_PATH)).toBe(false);
  });

  it("is finished when the app comes back to the front without going to it", async () => {
    iPhoneApp();
    render(<ServiceWorkerMessages />);
    await settle();
    setVisibility("hidden");
    keepTap();
    setVisibility("visible");
    await settle();
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
  });

  it("is left alone when its link already loaded", async () => {
    iPhoneApp();
    keepTap();
    document.cookie = `${OPENED_NOTIFICATION_COOKIE}=41; path=/`;
    render(<ServiceWorkerMessages />);
    await settle();
    expect(assign).not.toHaveBeenCalled();
    expect(store.has(LAST_TAP_PATH)).toBe(false);
  });

  it("is left alone on its own page, for a notification shown before the open route", async () => {
    window.history.pushState({}, "", "/my_notifications/41");
    keepTap({ id: null, url: "/my_notifications/41" });
    render(<ServiceWorkerMessages />);
    await settle();
    expect(assign).not.toHaveBeenCalled();
    expect(store.has(LAST_TAP_PATH)).toBe(false);
  });

  it("is dropped when it is more than two minutes old", async () => {
    iPhoneApp();
    keepTap({ at: Date.now() - 3 * 60 * 1000 });
    render(<ServiceWorkerMessages />);
    await settle();
    expect(assign).not.toHaveBeenCalled();
    expect(store.has(LAST_TAP_PATH)).toBe(false);
  });

  it("is not finished by a browser tab on another page", async () => {
    window.history.pushState({}, "", "/dashboard/festivals/3/edit");
    keepTap();
    render(<ServiceWorkerMessages />);
    await settle();
    expect(assign).not.toHaveBeenCalled();
    expect(store.has(LAST_TAP_PATH)).toBe(true);
  });

  it("is not finished on the sign-in page, which goes on to it once signed in", async () => {
    iPhoneApp();
    window.history.pushState(
      {},
      "",
      "/sign_in?redirect_url=%2Fmy_notifications%2F41%2Fopen",
    );
    keepTap();
    render(<ServiceWorkerMessages />);
    await settle();
    expect(assign).not.toHaveBeenCalled();
  });

  it("is opened once when the worker's message for it also arrives", async () => {
    iPhoneApp();
    const tapId = newTapId();
    keepTap({ tapId });
    render(<ServiceWorkerMessages />);
    await settle();
    expect(
      await send({
        type: SW_OPEN,
        url: "/my_notifications/41/open",
        id: 41,
        tapId,
      }),
    ).toEqual({ accepted: true });
    expect(assign).toHaveBeenCalledTimes(1);
  });
});

describe("notifications that arrived while the iPhone app was in the background", () => {
  let nextId = 100;

  function arrival(at: number, overrides: Record<string, unknown> = {}) {
    nextId += 1;
    return {
      id: nextId,
      title: `Recibiste ${nextId} créditos`,
      body: "Ya están en tu billetera.",
      url: `/my_notifications/${nextId}/open`,
      at,
      ...overrides,
    };
  }

  async function goAwayAndBack(arrivals: (since: number) => unknown[]) {
    render(<ServiceWorkerMessages />);
    await settle();
    setVisibility("hidden");
    const since = Date.now();
    keep(ARRIVALS_PATH, arrivals(since));
    setVisibility("visible");
    await settle();
  }

  beforeEach(() => {
    iPhoneApp();
  });

  it("offers the one that arrived, opening it from the toast", async () => {
    let latest = arrival(0);
    await goAwayAndBack((since) => {
      latest = arrival(since + 1);
      return [arrival(since - 1000), latest];
    });
    expect(toastMock).toHaveBeenCalledTimes(1);
    const [title, options] = toastMock.mock.calls[0];
    expect(title).toBe(latest.title);
    expect(options.description).toBe("Ya están en tu billetera.");
    expect(options.duration).toBe(10_000);
    expect(options.action.label).toBe("Ver");
    options.action.onClick();
    expect(assign).toHaveBeenCalledWith(latest.url);
  });

  it("counts several, opening the inbox", async () => {
    await goAwayAndBack((since) => [arrival(since + 1), arrival(since + 2)]);
    const [title, options] = toastMock.mock.calls[0];
    expect(title).toBe("Tenés 2 notificaciones nuevas");
    options.action.onClick();
    expect(assign).toHaveBeenCalledWith("/my_notifications");
  });

  it("gives no count when older ones may have dropped off the list", async () => {
    await goAwayAndBack((since) =>
      Array.from({ length: ARRIVALS_KEPT }, (_, index) =>
        arrival(since + index + 1),
      ),
    );
    expect(toastMock.mock.calls[0]?.[0]).toBe("Tenés notificaciones nuevas");
  });

  it("says what a disciplinary notice's push said, without naming Glitter in Glitter", async () => {
    await goAwayAndBack((since) => [
      arrival(since + 1, {
        title: SENSITIVE_PUSH_TITLE,
        body: SENSITIVE_PUSH_BODY,
      }),
    ]);
    const [title, options] = toastMock.mock.calls[0];
    expect(title).toBe(SENSITIVE_PUSH_BODY);
    expect(options.description).toBeUndefined();
  });

  it("leaves out 'Tocá para ver el detalle', since only 'Ver' opens it", async () => {
    await goAwayAndBack((since) => [
      arrival(since + 1, { body: WRITTEN_TEXT_PUSH_BODY }),
    ]);
    expect(toastMock.mock.calls[0]?.[1].description).toBeUndefined();
  });

  it("offers nothing that arrived before it went to the background", async () => {
    await goAwayAndBack((since) => [arrival(since - 1)]);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("offers nothing in the inbox, which shows them itself", async () => {
    window.history.pushState({}, "", "/my_notifications");
    await goAwayAndBack((since) => [arrival(since + 1)]);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("offers them on a notification's own page, which lists nothing", async () => {
    window.history.pushState({}, "", "/my_notifications/7");
    await goAwayAndBack((since) => [arrival(since + 1)]);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("leaves out the one a tap just opened", async () => {
    await goAwayAndBack((since) => {
      const opened = arrival(since + 1);
      document.cookie = `${OPENED_NOTIFICATION_COOKIE}=${opened.id}; path=/`;
      return [opened];
    });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("offers one item once, however often it comes back", async () => {
    const once = arrival(Date.now() + 60_000);
    await goAwayAndBack(() => [once, { ...once, at: once.at + 1 }]);
    setVisibility("hidden");
    setVisibility("visible");
    await settle();
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0]?.[0]).toBe(once.title);
  });

  it("offers nothing when it is already opening a tap", async () => {
    render(<ServiceWorkerMessages />);
    await settle();
    setVisibility("hidden");
    const since = Date.now();
    keep(ARRIVALS_PATH, [arrival(since + 1)]);
    keep(LAST_TAP_PATH, {
      id: 41,
      url: "/my_notifications/41/open",
      tapId: newTapId(),
      at: since + 2,
    });
    setVisibility("visible");
    await settle();
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("offers nothing on a first load", async () => {
    keep(ARRIVALS_PATH, [arrival(Date.now())]);
    render(<ServiceWorkerMessages />);
    await settle();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("offers nothing in a browser tab, where the device showed it and a tap says which", async () => {
    setUserAgent(DESKTOP_CHROME);
    delete (navigator as unknown as Record<string, unknown>).standalone;
    standalone = false;
    await goAwayAndBack((since) => [arrival(since + 1)]);
    expect(toastMock).not.toHaveBeenCalled();
  });
});

describe("a notification that arrives while the iPhone app is on screen", () => {
  const live = {
    id: 77,
    title: "Tu reserva está confirmada",
    body: "Te esperamos el sábado.",
    url: "/my_notifications/77/open",
    at: 1,
  };

  it("is offered at once, as iOS may show nothing or not say when it is tapped", async () => {
    iPhoneApp();
    render(<ServiceWorkerMessages />);
    await settle();
    await send({ type: SW_NOTIFICATION_RECEIVED, arrival: live });
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0]?.[0]).toBe(live.title);
  });

  it("is not offered again when the app comes back later", async () => {
    iPhoneApp();
    render(<ServiceWorkerMessages />);
    await settle();
    setVisibility("hidden");
    keep(ARRIVALS_PATH, [{ ...live, at: Date.now() + 1 }]);
    setVisibility("visible");
    await settle();
    await send({ type: SW_NOTIFICATION_RECEIVED, arrival: live });
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("is left to the device everywhere else", async () => {
    render(<ServiceWorkerMessages />);
    await settle();
    await send({ type: SW_NOTIFICATION_RECEIVED, arrival: live });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("waits for the return when iOS wakes the app before saying it is back, as a tap may be opening it", async () => {
    iPhoneApp();
    render(<ServiceWorkerMessages />);
    await settle();
    setVisibility("hidden");
    // Visible again, with the page not yet told.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await send({ type: SW_NOTIFICATION_RECEIVED, arrival: live });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("waits while the app is in the background, to be offered on its return", async () => {
    iPhoneApp();
    render(<ServiceWorkerMessages />);
    await settle();
    setVisibility("hidden");
    await send({ type: SW_NOTIFICATION_RECEIVED, arrival: live });
    expect(toastMock).not.toHaveBeenCalled();
  });
});
