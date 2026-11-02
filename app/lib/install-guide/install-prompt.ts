/**
 * The browser's offer to install Glitter (`beforeinstallprompt`, Chromium
 * only: Chrome, Edge, Opera, Samsung Internet), kept so the Instalar button on
 * `/instalar` can show it on a tap.
 *
 * The browser fires the event once per page load, often before React has
 * hydrated and usually on whatever page the person landed on, not on
 * `/instalar`. So instrumentation-client.ts starts listening before the app
 * runs, and the event is kept on `window` rather than in this module, which
 * the instrumentation bundle and the app's bundle may each load separately.
 *
 * The browser's own offer (the address-bar icon, Android's menu entry) is left
 * alone: nothing here calls `preventDefault`.
 *
 * Client-only.
 */

export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

type InstallPromptState = {
  event: BeforeInstallPromptEvent | null;
  /** The browser said Glitter was installed during this page's life. */
  installed: boolean;
  listening: boolean;
};

declare global {
  interface Window {
    __glitterInstallPrompt?: InstallPromptState;
  }
}

/** `ready`: the button can open the prompt. */
export type InstallPromptStatus = "none" | "ready" | "installed";

export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

const CHANGE_EVENT = "glitter:install-prompt";

function state(): InstallPromptState {
  window.__glitterInstallPrompt ??= {
    event: null,
    installed: false,
    listening: false,
  };
  return window.__glitterInstallPrompt;
}

function announce() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Starts keeping the offer. Safe to call more than once: only the first call
 * listens. `onInstalled` runs when the browser reports an install, whichever
 * way it was started. Returns what stops listening (for tests).
 */
export function listenForInstallPrompt({
  onInstalled,
}: { onInstalled?: () => void } = {}): () => void {
  if (typeof window === "undefined") return () => {};
  const current = state();
  if (current.listening) return () => {};
  current.listening = true;

  function keep(event: Event) {
    current.event = event as BeforeInstallPromptEvent;
    current.installed = false;
    announce();
  }
  function installed() {
    current.event = null;
    current.installed = true;
    announce();
    onInstalled?.();
  }
  window.addEventListener("beforeinstallprompt", keep);
  window.addEventListener("appinstalled", installed);
  return () => {
    window.removeEventListener("beforeinstallprompt", keep);
    window.removeEventListener("appinstalled", installed);
    current.listening = false;
  };
}

export function subscribeToInstallPrompt(listener: () => void) {
  // In case instrumentation did not run (a failed bundle); stays on, as the
  // instrumentation's listener would.
  listenForInstallPrompt();
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export function readInstallPromptStatus(): InstallPromptStatus {
  const current = state();
  if (current.installed) return "installed";
  return current.event ? "ready" : "none";
}

/**
 * Shows the browser's install dialog and says how it was answered.
 * `unavailable` when there is no offer to show, or the browser refused to
 * show it; the page then falls back to the menu steps.
 */
export async function promptInstall(): Promise<InstallPromptOutcome> {
  const current = state();
  const event = current.event;
  if (!event) return "unavailable";
  // An offer prompts once; the browser sends a fresh one if it may ask again.
  current.event = null;
  announce();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "unavailable";
  }
}
