"use client";

import { BellRingIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useTransition } from "react";
import { toast } from "sonner";

import {
  announcePushDeviceChanged,
  type PushDeviceResult,
  useIsAppleMobile,
  usePushDevice,
  usePushSupport,
} from "@/app/components/notifications/use-push-device";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { removePushDeviceAction } from "@/app/lib/notifications/push/actions";
import type { PushSupport } from "@/app/lib/notifications/push/support";
import { cn } from "@/lib/utils";

export const ENABLE_PUSH_LABEL = "Recibir notificaciones en este dispositivo";

const ENABLED_TOAST =
  "Listo, vas a recibir notificaciones en este dispositivo.";
const DISABLED_TOAST =
  "Ya no vas a recibir notificaciones en este dispositivo.";

/** One row of the device list, formatted on the server. */
export type PushDeviceRow = {
  id: number;
  label: string | null;
  lastUsedLabel: string;
};

/**
 * Why the control cannot be used here, and what to do about it. Null when it
 * can. Shown as text: a disabled button cannot carry a tooltip.
 */
function blockedReason(
  support: PushSupport,
  publicKey: string | null,
  appleMobile: boolean,
): string | null {
  switch (support) {
    case "ios-needs-install":
      return "En iPhone y iPad, las notificaciones llegan solo si agregás Glitter a la pantalla de inicio. En Safari, tocá Compartir y después «Agregar a inicio». Después abrí Glitter desde ese ícono y tocá la campana para activarlas.";
    case "ios-in-app-browser":
      return "Abrí esta página en Safari para poder agregar Glitter a la pantalla de inicio y recibir notificaciones.";
    case "ios-outdated":
      return "Para recibir notificaciones en iPhone o iPad necesitás iOS 16.4 o posterior.";
    case "unsupported":
      return "Este navegador no puede recibir notificaciones. Probá con Chrome, Edge, Firefox o Safari actualizados.";
    case "denied":
      return appleMobile
        ? "Las notificaciones están desactivadas. Abrí Configuración › Notificaciones › Glitter, activá «Permitir notificaciones» y volvé a abrir Glitter."
        : "Las notificaciones de Glitter están bloqueadas en este navegador. Para recibirlas, permitilas para este sitio en la configuración del navegador y recargá la página.";
  }
  if (!publicKey) return "Las notificaciones no están disponibles por ahora.";
  return null;
}

function report(result: PushDeviceResult, success: string) {
  if (result.ok) toast.success(success);
  else if (result.message) toast.error(result.message);
}

/**
 * The full control, for `/my_notifications`: what this device does, the
 * button, the reason when it cannot, and the person's devices. Once this
 * device receives avisos it shrinks to one line, so the inbox below is not
 * pushed down on every visit.
 */
export function PushControl({
  publicKey,
  devices,
}: {
  /** Null when avisos are not configured in this environment. */
  publicKey: string | null;
  devices: PushDeviceRow[];
}) {
  const router = useRouter();
  const support = usePushSupport();
  const appleMobile = useIsAppleMobile();
  const device = usePushDevice({ publicKey, support, refresh: true });
  const [removing, startRemoving] = useTransition();
  const reason = blockedReason(support, publicKey, appleMobile);
  const busy = device.phase === "working" || removing;
  const on = device.phase === "on" && !reason;

  async function turnOn() {
    const result = await device.enable();
    report(result, ENABLED_TOAST);
    if (result.ok) router.refresh();
  }

  async function turnOff() {
    const result = await device.disable();
    report(result, DISABLED_TOAST);
    if (result.ok) router.refresh();
  }

  function remove(row: PushDeviceRow) {
    if (row.id === device.deviceId) {
      void turnOff();
      return;
    }
    startRemoving(async () => {
      const result = await removePushDeviceAction(row.id).catch(() => null);
      if (!result?.success) {
        toast.error("No pudimos quitar el dispositivo. Intentá de nuevo.");
        return;
      }
      toast.success(
        `Quitamos ${row.label ?? "el dispositivo"}. Ya no va a recibir tus notificaciones.`,
      );
      announcePushDeviceChanged();
      router.refresh();
    });
  }

  let status: ReactNode;
  if (support === "unknown" || (!reason && device.phase === "checking")) {
    status = <Skeleton className="h-4 w-3/4" />;
  } else if (reason) {
    status = reason;
  } else if (on) {
    status = "Este dispositivo recibe tus notificaciones.";
  } else {
    status =
      "Te avisamos acá cuando haya novedades de tus reservas, pagos y créditos, aunque no tengas Glitter abierto.";
  }

  const deviceList = devices.length > 0 && (
    <details className="group border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium">
        Tus dispositivos ({devices.length})
      </summary>
      <ul className="mt-2 space-y-2">
        {devices.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {row.label ?? "Dispositivo"}
                </span>
                {row.id === device.deviceId && (
                  <Badge variant="secondary">Este dispositivo</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Último uso: {row.lastUsedLabel}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Quitar ${row.label ?? "dispositivo"} (último uso ${row.lastUsedLabel})`}
              onClick={() => remove(row)}
            >
              <XIcon className="h-4 w-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );

  // Once on, one line: the inbox below is not pushed down on every visit.
  if (on) {
    return (
      <section
        aria-labelledby="push-control-heading"
        className="space-y-2 rounded-lg border px-4 py-3"
      >
        <h2 id="push-control-heading" className="sr-only">
          Notificaciones en este dispositivo
        </h2>
        <div className="flex items-center gap-3">
          <BellRingIcon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">{status}</p>
          <Button
            variant="link"
            size="sm"
            className="h-auto shrink-0 p-0"
            disabled={busy}
            aria-label="Dejar de recibir notificaciones en este dispositivo"
            onClick={turnOff}
          >
            Desactivar
          </Button>
        </div>
        {deviceList}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="push-control-heading"
      className="space-y-3 rounded-lg border p-4"
    >
      <div className="flex items-start gap-3">
        <BellRingIcon
          className="mt-0.5 h-5 w-5 shrink-0 text-primary"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="push-control-heading" className="font-semibold">
            Notificaciones en este dispositivo
          </h2>
          <div className="text-sm text-muted-foreground">{status}</div>
        </div>
      </div>

      {/* An iPhone outside the home-screen app gets the steps, not a button
          it could never use there. */}
      {support !== "unknown" && !support.startsWith("ios-") && (
        <Button
          size="sm"
          disabled={busy || reason != null || device.phase === "checking"}
          aria-busy={device.phase === "working"}
          onClick={turnOn}
        >
          {ENABLE_PUSH_LABEL}
        </Button>
      )}

      {deviceList}
    </section>
  );
}

/**
 * The short offer, for the bell and for moments worth being told about (a
 * reservation in review or confirmed, a gift). Renders only when this device
 * could turn avisos on and has not: the reasons and steps belong on
 * `/my_notifications`. On an iPhone outside the home-screen app it links
 * there instead.
 *
 * `showBlocked`, for the bell: a desktop browser that blocked avisos says so
 * in a line that leads to the explanation, rather than showing nothing.
 */
export function PushOffer({
  publicKey,
  prompt,
  className,
  onNavigate,
  showBlocked = false,
}: {
  publicKey: string | null;
  /** A lead-in for the re-offers, before the button. */
  prompt?: string;
  className?: string;
  /** Closes the popover when a link is followed. */
  onNavigate?: () => void;
  showBlocked?: boolean;
}) {
  const support = usePushSupport();
  const device = usePushDevice({ publicKey, support, refresh: false });

  if (!publicKey) return null;

  const helpLink = (label: string) => (
    <Link
      href="/my_notifications"
      onClick={onNavigate}
      className="font-medium text-primary hover:underline"
    >
      {label}
    </Link>
  );

  let content: ReactNode = null;
  if (support === "ios-needs-install" || support === "ios-in-app-browser") {
    content = helpLink("Cómo activar las notificaciones");
  } else if (
    (support === "default" || support === "granted") &&
    (device.phase === "off" || device.phase === "working")
  ) {
    const working = device.phase === "working";
    content = (
      <>
        {prompt && <span className="text-muted-foreground">{prompt} </span>}
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          // Not `disabled`: that would drop focus out of the popover.
          aria-disabled={working}
          aria-busy={working}
          onClick={async () => {
            if (working) return;
            report(await device.enable(), ENABLED_TOAST);
          }}
        >
          {ENABLE_PUSH_LABEL}
        </Button>
      </>
    );
  } else if (showBlocked && support === "denied") {
    content = (
      <span className="text-muted-foreground">
        Notificaciones bloqueadas en este navegador ·{" "}
        {helpLink("Cómo activarlas")}
      </span>
    );
  } else if (showBlocked && support === "unsupported") {
    content = (
      <span className="text-muted-foreground">
        Este navegador no puede recibir notificaciones
      </span>
    );
  }
  if (!content) return null;

  return <div className={cn("text-sm", className)}>{content}</div>;
}
