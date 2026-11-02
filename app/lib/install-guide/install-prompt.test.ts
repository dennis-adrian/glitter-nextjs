import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listenForInstallPrompt,
  promptInstall,
  readInstallPromptStatus,
  subscribeToInstallPrompt,
} from "@/app/lib/install-guide/install-prompt";

/** What Chrome dispatches when Glitter can be installed. */
function offerInstall(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
}

let stops: (() => void)[] = [];

/** Listens as instrumentation-client.ts does, until the test ends. */
function listen(options?: Parameters<typeof listenForInstallPrompt>[0]) {
  stops.push(listenForInstallPrompt(options));
}

beforeEach(() => {
  // Each test starts as a fresh page would.
  delete window.__glitterInstallPrompt;
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  delete window.__glitterInstallPrompt;
});

describe("the kept install offer", () => {
  it("has nothing to show until the browser offers", async () => {
    listen();
    expect(readInstallPromptStatus()).toBe("none");
    await expect(promptInstall()).resolves.toBe("unavailable");
  });

  it("keeps the offer and shows it once, on a tap", async () => {
    listen();
    const event = offerInstall("accepted");
    expect(readInstallPromptStatus()).toBe("ready");

    await expect(promptInstall()).resolves.toBe("accepted");
    expect(event.prompt).toHaveBeenCalledTimes(1);
    // An offer prompts only once.
    expect(readInstallPromptStatus()).toBe("none");
    await expect(promptInstall()).resolves.toBe("unavailable");
  });

  it("reports a dismissed prompt", async () => {
    listen();
    offerInstall("dismissed");
    await expect(promptInstall()).resolves.toBe("dismissed");
  });

  it("falls back when the browser refuses to show the prompt", async () => {
    listen();
    const event = offerInstall();
    event.prompt.mockRejectedValue(new Error("NotAllowedError"));
    await expect(promptInstall()).resolves.toBe("unavailable");
  });

  it("never stops the browser's own offer", () => {
    listen();
    const event = offerInstall();
    expect(event.defaultPrevented).toBe(false);
  });

  it("says installed, and tells listeners, once the browser installs", () => {
    const onInstalled = vi.fn();
    listen({ onInstalled });
    const listener = vi.fn();
    const unsubscribe = subscribeToInstallPrompt(listener);

    offerInstall();
    window.dispatchEvent(new Event("appinstalled"));

    expect(readInstallPromptStatus()).toBe("installed");
    expect(onInstalled).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("listens only once however often it is started", () => {
    const onInstalled = vi.fn();
    listen({ onInstalled });
    listen({ onInstalled });
    window.dispatchEvent(new Event("appinstalled"));
    expect(onInstalled).toHaveBeenCalledTimes(1);
  });
});
