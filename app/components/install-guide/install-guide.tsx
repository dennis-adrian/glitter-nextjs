"use client";

import {
  BellRingIcon,
  CheckIcon,
  CircleCheckIcon,
  CopyIcon,
  DownloadIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  InstallStepList,
  installGuideFor,
  OTHER_DEVICE_GUIDES,
  UiLabel,
} from "@/app/components/install-guide/install-steps";
import {
  useInstallContext,
  useInstallPromptStatus,
} from "@/app/components/install-guide/use-install-guide";
import {
  ENABLE_PUSH_LABEL,
  PushControl,
  type PushDeviceRow,
} from "@/app/components/notifications/push-control";
import { usePushSupport } from "@/app/components/notifications/use-push-device";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { INSTALL_GUIDE_PATH } from "@/app/lib/install-guide/definitions";
import {
  type InstallPromptOutcome,
  promptInstall,
} from "@/app/lib/install-guide/install-prompt";
import {
  type InstallContext,
  installPlatformGroup,
} from "@/app/lib/install-guide/platform";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

export const INSTALL_BUTTON_LABEL = "Instalar Glitter";

/**
 * The other-device guide this device's own steps already cover. An in-app
 * browser keeps them all: its next stop is Safari or Chrome.
 */
const OWN_GUIDE: Partial<Record<InstallContext["platform"], string>> = {
  "ios-safari": "ios",
  "ios-browser": "ios",
  "android-chromium": "android",
  "android-firefox": "android",
  "desktop-chromium": "desktop",
  "desktop-safari": "mac",
};

/** Where the prompt can be shown: Chromium, on a phone or a computer. */
function canOfferPrompt(context: InstallContext) {
  return (
    context.platform === "android-chromium" ||
    context.platform === "desktop-chromium"
  );
}

function StepHeading({
  number,
  id,
  children,
}: {
  number: number;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
      >
        {number}
      </span>
      <span>
        <span className="sr-only">Paso {number}: </span>
        {children}
      </span>
    </h2>
  );
}

function noSubscription() {
  return () => {};
}

/** This page's address, to paste into the phone's own browser. */
function CopyLinkButton() {
  const url = useSyncExternalStore(
    noSubscription,
    () => `${window.location.origin}${INSTALL_GUIDE_PATH}`,
    () => null,
  );
  const [copied, setCopied] = useState(false);

  if (!url) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 p-2">
      <code className="min-w-0 flex-1 select-all break-all text-xs">{url}</code>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            // Some in-app browsers refuse the clipboard; the address above
            // can still be selected and copied by hand.
            setCopied(false);
          }
        }}
      >
        {copied ? (
          <CheckIcon className="size-4" aria-hidden />
        ) : (
          <CopyIcon className="size-4" aria-hidden />
        )}
        {copied ? "Copiado" : "Copiar enlace"}
      </Button>
    </div>
  );
}

/** Step 1 for this device: the button where the browser offers one. */
function ThisDeviceInstall({ context }: { context: InstallContext }) {
  const status = useInstallPromptStatus();
  const [outcome, setOutcome] = useState<InstallPromptOutcome | null>(null);
  const [asking, setAsking] = useState(false);

  if (context.platform === "unknown") {
    return (
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  if (context.platform === "installed") {
    return (
      <p className="flex items-start gap-2 text-sm">
        <CircleCheckIcon
          className="mt-0.5 size-5 shrink-0 text-emerald-600"
          aria-hidden
        />
        Ya estás usando Glitter instalado en este dispositivo.
      </p>
    );
  }

  if (status === "installed" || outcome === "accepted") {
    return (
      <p role="status" className="flex items-start gap-2 text-sm">
        <CircleCheckIcon
          className="mt-0.5 size-5 shrink-0 text-emerald-600"
          aria-hidden
        />
        {context.platform === "desktop-chromium"
          ? "¡Listo! Glitter quedó instalado y se abre en su propia ventana."
          : "¡Listo! Glitter quedó instalado. Abrilo desde su ícono en tu pantalla de inicio."}
      </p>
    );
  }

  const guide = installGuideFor(context.platform, context.browser);
  const inApp =
    context.platform === "ios-in-app" || context.platform === "android-in-app";

  if (canOfferPrompt(context) && (status === "ready" || asking)) {
    return (
      <div className="space-y-3">
        <Button
          size="lg"
          className="w-full gap-2 sm:w-auto"
          aria-busy={asking}
          disabled={asking}
          onClick={async () => {
            setAsking(true);
            const result = await promptInstall();
            setAsking(false);
            setOutcome(result);
            captureClientEvent(POSTHOG_EVENTS.INSTALL_PROMPT_ANSWERED, {
              outcome: result,
              platform: installPlatformGroup(context.platform),
              browser: context.browser,
            });
          }}
        >
          <DownloadIcon className="size-4" aria-hidden />
          {INSTALL_BUTTON_LABEL}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {outcome === "dismissed" && (
        <p role="status" className="text-sm text-muted-foreground">
          No pasa nada. Cuando quieras, podés instalarla desde el menú del
          navegador:
        </p>
      )}
      {/* The prompt was never offered here: maybe Glitter is already
          installed on this device, or the browser wants more visits first. */}
      {canOfferPrompt(context) && outcome !== "dismissed" && (
        <p className="text-sm text-muted-foreground">
          Si ya instalaste Glitter en este dispositivo, abrilo desde su ícono.
          Si no, seguí estos pasos:
        </p>
      )}
      {guide && <InstallStepList guide={guide} />}
      {inApp && <CopyLinkButton />}
    </div>
  );
}

/** Step 2: turning notifications on, once the app can receive them. */
function NotificationsStep({
  signedIn,
  publicKey,
  devices,
}: {
  signedIn: boolean;
  publicKey: string | null;
  devices: PushDeviceRow[];
}) {
  const support = usePushSupport();

  if (!signedIn) {
    return (
      <div className="space-y-3 text-sm">
        <p>
          Iniciá sesión con tu cuenta de Glitter y activá las notificaciones en
          este dispositivo.
        </p>
        <Button asChild variant="outline">
          <Link
            href={`/sign_in?redirect_url=${encodeURIComponent(INSTALL_GUIDE_PATH)}`}
          >
            Iniciar sesión
          </Link>
        </Button>
      </div>
    );
  }

  // On an iPhone, the notifications control only works inside the installed
  // app: say where to find it there instead of repeating step 1.
  if (support === "ios-needs-install" || support === "ios-in-app-browser") {
    return (
      <p className="text-sm leading-relaxed">
        Cuando abras Glitter desde su ícono, tocá la campana{" "}
        <UiLabel icon={<BellRingIcon aria-hidden />} srLabel="Notificaciones" />{" "}
        y elegí «{ENABLE_PUSH_LABEL}». En iPhone y iPad las notificaciones
        llegan solo a Glitter instalado.
      </p>
    );
  }

  return <PushControl publicKey={publicKey} devices={devices} />;
}

function InstallGuideViewTracker({
  context,
  pushAvailable,
  signedIn,
}: {
  context: InstallContext;
  pushAvailable: boolean;
  signedIn: boolean;
}) {
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current || context.platform === "unknown") return;
    captured.current = true;
    captureClientEvent(POSTHOG_EVENTS.INSTALL_GUIDE_VIEWED, {
      platform: context.platform,
      browser: context.browser,
      push_available: pushAvailable,
      signed_in: signedIn,
    });
  }, [context, pushAvailable, signedIn]);
  return null;
}

/**
 * `/instalar`: install Glitter on this device, then turn on its
 * notifications. The steps follow the device; the others are one tap away.
 */
export default function InstallGuide({
  pushAvailable,
  signedIn,
  publicKey,
  devices,
}: {
  /** Notifications are open to this viewer and configured here. */
  pushAvailable: boolean;
  signedIn: boolean;
  publicKey: string | null;
  devices: PushDeviceRow[];
}) {
  const context = useInstallContext();

  return (
    <div className="space-y-4">
      <InstallGuideViewTracker
        context={context}
        pushAvailable={pushAvailable}
        signedIn={signedIn}
      />

      <section
        aria-labelledby="install-step-heading"
        className="space-y-4 rounded-lg border p-4 md:p-5"
      >
        <StepHeading number={1} id="install-step-heading">
          Instalá Glitter
        </StepHeading>
        <ThisDeviceInstall context={context} />
      </section>

      {pushAvailable && (
        <section
          aria-labelledby="notifications-step-heading"
          className="space-y-4 rounded-lg border p-4 md:p-5"
        >
          <StepHeading number={2} id="notifications-step-heading">
            Activá las notificaciones
          </StepHeading>
          <NotificationsStep
            signedIn={signedIn}
            publicKey={publicKey}
            devices={devices}
          />
        </section>
      )}

      <section aria-labelledby="other-devices-heading" className="pt-2">
        <h2 id="other-devices-heading" className="mb-2 font-semibold">
          ¿Usás otro dispositivo?
        </h2>
        <div className="divide-y rounded-lg border">
          {OTHER_DEVICE_GUIDES.filter(
            ({ key }) => key !== OWN_GUIDE[context.platform],
          ).map(({ key, title, guide }) => (
            <details key={key} className="px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium marker:text-muted-foreground">
                {title}
              </summary>
              <div className="pt-3">
                <InstallStepList guide={guide} />
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
