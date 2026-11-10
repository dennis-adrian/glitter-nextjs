"use client";

import { BellRingIcon } from "lucide-react";
import Link from "next/link";
import { useId, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useViewState } from "@/app/components/impersonation/view-state";
import { ENABLE_PUSH_LABEL } from "@/app/components/notifications/push-control";
import {
  usePushDevice,
  usePushSupport,
} from "@/app/components/notifications/use-push-device";
import { Button } from "@/app/components/ui/button";
import { INSTALL_GUIDE_PATH } from "@/app/lib/install-guide/definitions";

/** «Ahora no» hides the banner on this device for this long. */
export const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;
export const DISMISSED_AT_KEY = "glitter:home-push-banner-dismissed-at";

const PITCH =
  "Te avisamos al instante de tus reservas, pagos, créditos y novedades, aunque no tengas Glitter abierto.";

function readDismissed(now: number): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_AT_KEY));
    return Number.isFinite(at) && at > 0 && now - at < DISMISS_FOR_MS;
  } catch {
    // Storage blocked (private mode, some in-app browsers): just show it.
    return false;
  }
}

/** Set when storage refuses the write, so it still hides for this visit. */
let dismissedThisVisit = false;
const dismissListeners = new Set<() => void>();

function rememberDismissed(now: number) {
  dismissedThisVisit = true;
  try {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(now));
  } catch {
    // Nothing to keep it in; it hides for this visit only.
  }
  // Both copies on Inicio (one per layout size) hide together.
  for (const listener of dismissListeners) listener();
}

function subscribeToDismissed(listener: () => void) {
  dismissListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    dismissListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** For tests: a fresh page. */
export function resetDismissedForTests() {
  dismissedThisVisit = false;
}

/** Hidden on the server and while hydrating, so it never flashes. */
function useDismissed(): boolean {
  return useSyncExternalStore(
    subscribeToDismissed,
    () => dismissedThisVisit || readDismissed(Date.now()),
    () => true,
  );
}

/**
 * Inicio's nudge to turn notifications on, for a device that could and has
 * not. An iPhone outside the installed app is sent to `/instalar`, since
 * that is where its notifications start. Nothing shows when they are on,
 * when the browser blocked or cannot do them (there is nothing to do from
 * here), or when notifications are not open to this person (`publicKey`
 * null). «Ahora no» hides it on this device for 30 days.
 */
export default function HomePushBanner(props: HomePushBannerProps) {
  // This browser's push belongs to whoever is really signed in: while an
  // admin views the app as a participant, it is the admin's, so nothing here
  // may ask for permission or subscribe (docs/PLAN-impersonation.md §7.4).
  return useViewState() ? null : <HomePushBannerInner {...props} />;
}

type HomePushBannerProps = {
  /** Null when notifications are not open to this person here. */
  publicKey: string | null;
};

function HomePushBannerInner({ publicKey }: HomePushBannerProps) {
  const support = usePushSupport();
  const device = usePushDevice({ publicKey, support, refresh: false });
  const dismissed = useDismissed();
  // Inicio renders this twice (one copy per layout size), so no fixed id.
  const headingId = useId();

  if (!publicKey || dismissed) return null;

  const needsInstall =
    support === "ios-needs-install" || support === "ios-in-app-browser";
  const canTurnOn =
    (support === "default" || support === "granted") &&
    (device.phase === "off" || device.phase === "working");
  if (!needsInstall && !canTurnOn) return null;

  const working = device.phase === "working";

  function dismiss() {
    rememberDismissed(Date.now());
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-2xl border border-brand-primary/40 bg-brand-primary/10 p-4"
    >
      <div className="flex items-start gap-3">
        <BellRingIcon
          className="mt-0.5 size-5 shrink-0 text-brand-primary"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <h2
            id={headingId}
            className="font-display text-base font-bold text-brand-ink"
          >
            Activá las notificaciones
          </h2>
          <p className="text-sm text-brand-neutral">
            {needsInstall
              ? `${PITCH} En iPhone llegan solo con Glitter agregado a tu pantalla de inicio.`
              : PITCH}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-8">
        {needsInstall ? (
          <Button asChild size="sm">
            <Link href={INSTALL_GUIDE_PATH}>Ver cómo</Link>
          </Button>
        ) : (
          <Button
            size="sm"
            wrap
            aria-busy={working}
            disabled={working}
            onClick={async () => {
              const result = await device.enable();
              if (result.ok) {
                toast.success(
                  "Listo, vas a recibir notificaciones en este dispositivo.",
                );
              } else if (result.message) {
                toast.error(result.message);
              }
            }}
          >
            {ENABLE_PUSH_LABEL}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Ahora no
        </Button>
      </div>
    </section>
  );
}
