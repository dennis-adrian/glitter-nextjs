"use client";

import { useSyncExternalStore } from "react";

import {
  type InstallPromptStatus,
  readInstallPromptStatus,
  subscribeToInstallPrompt,
} from "@/app/lib/install-guide/install-prompt";
import {
  detectInstallContext,
  type InstallContext,
  UNKNOWN_INSTALL_CONTEXT,
} from "@/app/lib/install-guide/platform";

let cached: { key: string; context: InstallContext } | null = null;

/** Stable between renders, as `useSyncExternalStore` needs. */
function readContext(): InstallContext {
  const context = detectInstallContext(window);
  const key = `${context.platform}:${context.browser}`;
  if (cached?.key !== key) cached = { key, context };
  return cached.context;
}

function subscribeToDisplayMode(listener: () => void) {
  // Opening the page in the installed app, or Chrome moving this tab into the
  // app's window after an install, changes the display mode.
  const standalone = window.matchMedia?.("(display-mode: standalone)");
  standalone?.addEventListener?.("change", listener);
  window.addEventListener("appinstalled", listener);
  return () => {
    standalone?.removeEventListener?.("change", listener);
    window.removeEventListener("appinstalled", listener);
  };
}

/** Which steps fit this browser; `unknown` on the server and while hydrating. */
export function useInstallContext(): InstallContext {
  return useSyncExternalStore(
    subscribeToDisplayMode,
    readContext,
    () => UNKNOWN_INSTALL_CONTEXT,
  );
}

/** Whether the Instalar button can open the browser's install dialog. */
export function useInstallPromptStatus(): InstallPromptStatus {
  return useSyncExternalStore(
    subscribeToInstallPrompt,
    readInstallPromptStatus,
    () => "none" as const,
  );
}
