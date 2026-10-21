"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  forgetPushDeviceAction,
  releaseForeignPushDeviceAction,
  removePushDeviceAction,
  savePushDeviceAction,
} from "@/app/lib/notifications/push/actions";
import {
  detectPushSupport,
  isAppleMobile,
  type PushSupport,
  pushDeviceLabel,
  subscribedWithKey,
  urlBase64ToUint8Array,
} from "@/app/lib/notifications/push/support";

const SERVICE_WORKER_URL = "/sw.js";
/** How long a freshly registered worker may take to become active. */
const READY_TIMEOUT_MS = 10_000;

const supportListeners = new Set<() => void>();

/** Re-reads the permission after this page changed it (or may have). */
export function announcePushSupportChanged() {
  for (const listener of supportListeners) listener();
}

function subscribeToSupport(listener: () => void) {
  supportListeners.add(listener);
  // A permission changed in the site settings, or Glitter opened from the
  // home screen, shows when the person comes back to the page.
  document.addEventListener("visibilitychange", listener);
  window.addEventListener("focus", listener);
  const standalone = window.matchMedia?.("(display-mode: standalone)");
  standalone?.addEventListener?.("change", listener);
  return () => {
    supportListeners.delete(listener);
    document.removeEventListener("visibilitychange", listener);
    window.removeEventListener("focus", listener);
    standalone?.removeEventListener?.("change", listener);
  };
}

function readSupport(): PushSupport {
  return detectPushSupport(window as Parameters<typeof detectPushSupport>[0]);
}

/** What this browser can do; `unknown` on the server and while hydrating. */
export function usePushSupport(): PushSupport {
  return useSyncExternalStore(
    subscribeToSupport,
    readSupport,
    () => "unknown" as const,
  );
}

function noSubscription() {
  return () => {};
}

/** An iPhone or iPad, where the steps to change a permission differ. */
export function useIsAppleMobile(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => isAppleMobile(navigator),
    () => false,
  );
}

let deviceVersion = 0;
const deviceListeners = new Set<() => void>();

/**
 * This browser's avisos changed (turned on or off, here or by a removal):
 * every mounted control reads its subscription again, so the bell and a
 * re-offer on the same page never disagree.
 */
export function announcePushDeviceChanged() {
  deviceVersion += 1;
  for (const listener of deviceListeners) listener();
}

function subscribeToDevice(listener: () => void) {
  deviceListeners.add(listener);
  return () => {
    deviceListeners.delete(listener);
  };
}

function useDeviceVersion() {
  return useSyncExternalStore(
    subscribeToDevice,
    () => deviceVersion,
    () => 0,
  );
}

function registerWorker() {
  // `updateViaCache: "none"` so the browser always asks for a fresh worker.
  return navigator.serviceWorker.register(SERVICE_WORKER_URL, {
    scope: "/",
    updateViaCache: "none",
  });
}

/** The worker registration for this page, without registering one. */
async function currentRegistration() {
  if (!("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function subscriptionInput(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    label: pushDeviceLabel(navigator),
  };
}

/**
 * `checking` until this browser's subscription is known; `on` when it has one
 * Glitter knows about; `working` while turning avisos on or off.
 */
export type PushDevicePhase = "checking" | "off" | "on" | "working";

type DeviceState = { phase: PushDevicePhase; deviceId: number | null };

const OFF: DeviceState = { phase: "off", deviceId: null };

export type PushDeviceResult =
  | { ok: true }
  /** `message` null: nothing to report, such as a declined prompt. */
  | { ok: false; message: string | null };

const ENABLE_ERROR =
  "No pudimos activar los avisos en este dispositivo. Intentá de nuevo.";
const DISABLE_ERROR =
  "No pudimos desactivar los avisos en este dispositivo. Intentá de nuevo.";

/**
 * This browser's avisos: whether it is subscribed, and turning that on or
 * off. With `refresh`, a subscription found on load is reported back to the
 * server, which refreshes "Último uso" and answers whether the person still
 * has this device (they may have removed it from another one).
 */
export function usePushDevice({
  publicKey,
  support,
  refresh,
}: {
  publicKey: string | null;
  support: PushSupport;
  refresh: boolean;
}) {
  const [state, setState] = useState<DeviceState>({
    phase: "checking",
    deviceId: null,
  });
  const version = useDeviceVersion();
  // While turning avisos on or off, a check started by the permission or
  // subscription changing underneath must not overwrite "working".
  const inFlight = useRef(false);
  const canPush =
    publicKey != null && (support === "default" || support === "granted");

  useEffect(() => {
    if (!canPush || !publicKey) return;
    const key = publicKey;
    let current = true;

    async function check(): Promise<DeviceState> {
      // Registering never prompts, and doing it now spares the tap the wait.
      const registered = await registerWorker();
      const subscription = await registered.pushManager.getSubscription();
      if (!subscription) return OFF;
      if (
        !subscribedWithKey(subscription.options.applicationServerKey, key) ||
        support !== "granted"
      ) {
        // Made with keys this environment no longer uses, or the permission
        // was taken back: nothing reaches it. It goes, and the offer returns.
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe().catch(() => false);
        await forgetPushDeviceAction(endpoint).catch(() => null);
        return OFF;
      }
      if (!refresh) return { phase: "on", deviceId: null };

      const result = await savePushDeviceAction({
        ...subscriptionInput(subscription),
        refreshOnly: true,
      });
      if (result.success && result.deviceId == null) {
        // Removed from the list meanwhile: stop the browser too.
        await subscription.unsubscribe().catch(() => false);
        return OFF;
      }
      return { phase: "on", deviceId: result.deviceId ?? null };
    }

    check()
      .then((next) => {
        if (current && !inFlight.current) setState(next);
      })
      .catch(() => {
        if (current && !inFlight.current) setState(OFF);
      });
    return () => {
      current = false;
    };
  }, [canPush, publicKey, refresh, support, version]);

  /** Call straight from the tap: the prompt is asked for before any wait. */
  async function enable(): Promise<PushDeviceResult> {
    if (inFlight.current) return { ok: false, message: null };
    // First, before anything is awaited: Safari and Firefox only show the
    // prompt in direct response to the tap.
    const asked =
      Notification.permission === "default"
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
    if (!publicKey) return { ok: false, message: ENABLE_ERROR };
    inFlight.current = true;
    try {
      return await turnOn(asked, publicKey);
    } finally {
      inFlight.current = false;
    }
  }

  async function turnOn(
    asked: Promise<NotificationPermission>,
    key: string,
  ): Promise<PushDeviceResult> {
    setState({ phase: "working", deviceId: null });

    const permission = await asked.catch(() => Notification.permission);
    announcePushSupportChanged();
    if (permission !== "granted") {
      setState(OFF);
      // Declining or dismissing the prompt is an answer, not an error.
      return { ok: false, message: null };
    }

    let subscription: PushSubscription;
    try {
      await registerWorker();
      // Subscribing needs an active worker; `register` resolves before that.
      const ready = await withTimeout(
        navigator.serviceWorker.ready,
        READY_TIMEOUT_MS,
      );
      let existing = await ready.pushManager.getSubscription();
      if (
        existing &&
        !subscribedWithKey(existing.options.applicationServerKey, key)
      ) {
        await existing.unsubscribe();
        existing = null;
      }
      subscription =
        existing ??
        (await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));
    } catch {
      setState(OFF);
      return { ok: false, message: ENABLE_ERROR };
    }

    const result = await savePushDeviceAction(
      subscriptionInput(subscription),
    ).catch(() => null);
    if (!result?.success || result.deviceId == null) {
      await subscription.unsubscribe().catch(() => false);
      setState(OFF);
      return { ok: false, message: result?.message ?? ENABLE_ERROR };
    }
    setState({ phase: "on", deviceId: result.deviceId });
    announcePushDeviceChanged();
    return { ok: true };
  }

  async function disable(): Promise<PushDeviceResult> {
    if (inFlight.current) return { ok: false, message: null };
    inFlight.current = true;
    try {
      return await turnOff(state.deviceId);
    } finally {
      inFlight.current = false;
    }
  }

  async function turnOff(deviceId: number | null): Promise<PushDeviceResult> {
    setState({ phase: "working", deviceId });
    let endpoint: string | null = null;
    try {
      // The browser first: that needs no session and no server, and once it
      // is done the push service refuses anything sent here, which removes
      // the row on its own if the request below never lands.
      const registered = await currentRegistration();
      const subscription = await registered?.pushManager.getSubscription();
      endpoint = subscription?.endpoint ?? null;
      await subscription?.unsubscribe();
    } catch {
      setState({ phase: "on", deviceId });
      return { ok: false, message: DISABLE_ERROR };
    }
    await (
      deviceId
        ? removePushDeviceAction(deviceId)
        : endpoint
          ? forgetPushDeviceAction(endpoint)
          : Promise.resolve(null)
    ).catch(() => null);
    setState(OFF);
    announcePushDeviceChanged();
    return { ok: true };
  }

  return {
    phase: canPush ? state.phase : ("off" as const),
    deviceId: canPush ? state.deviceId : null,
    enable,
    disable,
  };
}

/**
 * Before signing out: stops this browser's avisos, so whoever uses it next
 * does not get them. The browser unsubscribes first, which needs no session;
 * the server row goes too if the request makes it before the session ends,
 * and otherwise on the next send, when the push service answers "gone".
 * Never holds sign-out up for long.
 */
export async function forgetThisBrowserForPush(timeoutMs = 1_500) {
  const work = (async () => {
    const registered = await currentRegistration();
    const subscription = await registered?.pushManager?.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    try {
      await subscription.unsubscribe();
    } catch {
      // Still try the server below.
    }
    await forgetPushDeviceAction(endpoint);
  })().catch(() => undefined);
  await Promise.race([
    work,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Once per session for a signed-in person: if this browser's subscription is
 * saved under another account (someone used it before and never signed out),
 * the server lets go of it and the browser unsubscribes. Does nothing on the
 * many browsers that never turned avisos on.
 */
export function useReleaseForeignPushDevice(userId: number | null) {
  useEffect(() => {
    if (userId == null) return;
    const key = `glitter:push-release-checked:${userId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked: checking once per page load is fine too.
    }
    (async () => {
      const registered = await currentRegistration();
      const subscription = await registered?.pushManager?.getSubscription();
      const auth = subscription?.toJSON().keys?.auth;
      if (!subscription || !auth) return;
      const result = await releaseForeignPushDeviceAction({
        endpoint: subscription.endpoint,
        auth,
      });
      if (result.success && result.released) {
        await subscription.unsubscribe();
        announcePushDeviceChanged();
      }
    })().catch(() => undefined);
  }, [userId]);
}
