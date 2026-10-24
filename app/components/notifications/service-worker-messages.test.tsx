import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: toastMock }));

import { onNotificationReceived } from "@/app/components/notifications/notification-events";
import ServiceWorkerMessages, {
  pageLoad,
} from "@/app/components/notifications/service-worker-messages";
import {
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
let container: FakeContainer;
let standalone = false;
let assign: ReturnType<typeof vi.spyOn>;
/** Every test's taps get their own ids: the page remembers opened ones. */
let tapCount = 0;

function newTapId() {
  tapCount += 1;
  return `tap-${tapCount}`;
}

function keep(key: string, value: unknown) {
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
  vi.stubGlobal("caches", {
    open: vi.fn(async (name: string) => {
      expect(name).toBe(NOTIFICATION_STATE_CACHE);
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
    const received = vi.fn();
    const unsubscribe = onNotificationReceived(received);
    await send({ type: SW_NOTIFICATION_RECEIVED });
    unsubscribe();
    expect(received).toHaveBeenCalledTimes(1);
  });

  it("opens a tap in the installed app, whatever page it is on", async () => {
    standalone = true;
    window.history.pushState({}, "", "/festivals/3");
    render(<ServiceWorkerMessages />);
    await settle();

    expect(await send(openMessage())).toEqual({ accepted: true });
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
  });

  it("opens it in a browser tab that is already in the inbox", async () => {
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

  it("opens one tap once, however many times it is asked", async () => {
    standalone = true;
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
      standalone = true;
      render(<ServiceWorkerMessages />);
      await settle();

      expect(await send(openMessage(url))).toEqual({ accepted: false });
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it("declines a tap without an id to tell it apart", async () => {
    standalone = true;
    render(<ServiceWorkerMessages />);
    await settle();
    expect(
      await send({ type: SW_OPEN, url: "/my_notifications/41/open" }),
    ).toEqual({ accepted: false });
    expect(assign).not.toHaveBeenCalled();
  });

  it("ignores messages it does not know", async () => {
    standalone = true;
    render(<ServiceWorkerMessages />);
    await settle();
    expect(await send({ type: "other", url: "/x" })).toBeUndefined();
    expect(assign).not.toHaveBeenCalled();
  });

  it("does nothing where service workers do not exist", () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    expect(() => render(<ServiceWorkerMessages />)).not.toThrow();
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

  it("is finished when the installed app opens at its start page instead", async () => {
    standalone = true;
    keepTap();
    render(<ServiceWorkerMessages />);
    await settle();
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
    expect(store.has(LAST_TAP_PATH)).toBe(false);
  });

  it("is finished when the app comes back to the front without going to it", async () => {
    standalone = true;
    render(<ServiceWorkerMessages />);
    await settle();
    setVisibility("hidden");
    keepTap();
    setVisibility("visible");
    await settle();
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
  });

  it("is left alone when its link already loaded", async () => {
    standalone = true;
    keepTap();
    document.cookie = `${OPENED_NOTIFICATION_COOKIE}=41; path=/`;
    render(<ServiceWorkerMessages />);
    await settle();
    expect(assign).not.toHaveBeenCalled();
    expect(store.has(LAST_TAP_PATH)).toBe(false);
  });

  it("is dropped when it is more than two minutes old", async () => {
    standalone = true;
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

  it("is opened once when the worker's message for it also arrives", async () => {
    standalone = true;
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

describe("notifications that arrived while Glitter was in the background", () => {
  function arrival(id: number, at: number) {
    return {
      id,
      title: `Recibiste ${id} créditos de regalo`,
      body: "Ya están en tu billetera.",
      url: `/my_notifications/${id}/open`,
      at,
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

  it("offers the one that arrived, opening it from the toast", async () => {
    await goAwayAndBack((since) => [
      arrival(9, since - 1000),
      arrival(41, since + 1),
    ]);
    expect(toastMock).toHaveBeenCalledTimes(1);
    const [title, options] = toastMock.mock.calls[0];
    expect(title).toBe("Recibiste 41 créditos de regalo");
    expect(options.description).toBe("Ya están en tu billetera.");
    expect(options.action.label).toBe("Ver");
    options.action.onClick();
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
  });

  it("counts several, opening the inbox", async () => {
    await goAwayAndBack((since) => [
      arrival(41, since + 1),
      arrival(42, since + 2),
    ]);
    const [title, options] = toastMock.mock.calls[0];
    expect(title).toBe("Tenés 2 notificaciones nuevas");
    options.action.onClick();
    expect(assign).toHaveBeenCalledWith("/my_notifications");
  });

  it("offers nothing that arrived before it went to the background", async () => {
    await goAwayAndBack((since) => [arrival(9, since - 1)]);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("offers nothing in the inbox, which shows them itself", async () => {
    window.history.pushState({}, "", "/my_notifications");
    await goAwayAndBack((since) => [arrival(41, since + 1)]);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("offers nothing when it is already opening a tap", async () => {
    standalone = true;
    render(<ServiceWorkerMessages />);
    await settle();
    setVisibility("hidden");
    const since = Date.now();
    keep(ARRIVALS_PATH, [arrival(41, since + 1)]);
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
    keep(ARRIVALS_PATH, [arrival(41, Date.now())]);
    render(<ServiceWorkerMessages />);
    await settle();
    expect(toastMock).not.toHaveBeenCalled();
  });
});
