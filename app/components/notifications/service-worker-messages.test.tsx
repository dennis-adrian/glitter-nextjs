import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onNotificationReceived } from "@/app/components/notifications/notification-events";
import ServiceWorkerMessages, {
  pageLoad,
  SW_NOTIFICATION_RECEIVED,
  SW_OPEN,
} from "@/app/components/notifications/service-worker-messages";

/** Stands in for `navigator.serviceWorker`, as far as the listener uses it. */
class FakeContainer extends EventTarget {
  startMessages = vi.fn();
}

let container: FakeContainer;
let standalone = false;

beforeEach(() => {
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
});

/** What the page answers the worker, and where it goes, for one message. */
function send(data: unknown) {
  const channel = new MessageChannel();
  const answers: unknown[] = [];
  channel.port1.onmessage = (event) => answers.push(event.data);
  const assign = vi.spyOn(pageLoad, "assign").mockImplementation(() => {});
  act(() => {
    container.dispatchEvent(
      new MessageEvent("message", { data, ports: [channel.port2] }),
    );
  });
  return {
    assign,
    /** The answer reaches port1 asynchronously. */
    async answer() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      channel.port1.close();
      return answers[0];
    },
  };
}

describe("the page's side of Glitter's service worker", () => {
  it("starts taking messages once it listens", () => {
    render(<ServiceWorkerMessages />);
    expect(container.startMessages).toHaveBeenCalledTimes(1);
  });

  it("refreshes the inbox and the bell when a notification arrives", () => {
    render(<ServiceWorkerMessages />);
    const received = vi.fn();
    const unsubscribe = onNotificationReceived(received);
    send({ type: SW_NOTIFICATION_RECEIVED });
    unsubscribe();
    expect(received).toHaveBeenCalledTimes(1);
  });

  it("opens a tapped notification in the installed app, whatever page it is on", async () => {
    standalone = true;
    window.history.pushState({}, "", "/festivals/3");
    render(<ServiceWorkerMessages />);

    const { assign, answer } = send({
      type: SW_OPEN,
      url: "/my_notifications/41/open",
    });

    expect(await answer()).toEqual({ accepted: true });
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
  });

  it("opens it in a browser tab that is already in the inbox", async () => {
    window.history.pushState({}, "", "/my_notifications");
    render(<ServiceWorkerMessages />);

    const { assign, answer } = send({
      type: SW_OPEN,
      url: "/my_notifications/41/open",
    });

    expect(await answer()).toEqual({ accepted: true });
    expect(assign).toHaveBeenCalledWith("/my_notifications/41/open");
  });

  it("leaves a browser tab on another page alone, so a form there is not lost", async () => {
    window.history.pushState({}, "", "/dashboard/festivals/3/edit");
    render(<ServiceWorkerMessages />);

    const { assign, answer } = send({
      type: SW_OPEN,
      url: "/my_notifications/41/open",
    });

    expect(await answer()).toEqual({ accepted: false });
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(["//evil.test/x", "/\\evil.test", "https://evil.test/", 42, null])(
    "never follows %s",
    async (url) => {
      standalone = true;
      render(<ServiceWorkerMessages />);

      const { assign, answer } = send({ type: SW_OPEN, url });

      expect(await answer()).toEqual({ accepted: false });
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it("ignores messages it does not know", async () => {
    standalone = true;
    render(<ServiceWorkerMessages />);
    const { assign, answer } = send({ type: "other", url: "/x" });
    expect(await answer()).toBeUndefined();
    expect(assign).not.toHaveBeenCalled();
  });

  it("does nothing where service workers do not exist", () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    expect(() => render(<ServiceWorkerMessages />)).not.toThrow();
  });
});
