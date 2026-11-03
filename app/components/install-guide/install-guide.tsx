"use client";

import {
  CheckIcon,
  CircleCheckIcon,
  CopyIcon,
  DownloadIcon,
  SmartphoneIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  InstallStepList,
  installGuideFor,
  NOTIFICATIONS_GUIDE,
  PHONE_GUIDES,
} from "@/app/components/install-guide/install-steps";
import {
  useInstallContext,
  useInstallPromptStatus,
} from "@/app/components/install-guide/use-install-guide";
import {
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
  detectInstallContext,
  type InstallContext,
  installPlatformGroup,
} from "@/app/lib/install-guide/platform";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

export const INSTALL_BUTTON_LABEL = "Instalar Glitter";

/**
 * The phone guide this phone's own steps already cover. An in-app browser
 * keeps both: its next stop is Safari or Chrome.
 */
const OWN_GUIDE: Partial<Record<InstallContext["platform"], string>> = {
  "ios-safari": "ios",
  "ios-browser": "ios",
  "android-chromium": "android",
  "android-firefox": "android",
};

/**
 * Where the Instalar button shows the browser's prompt: Chromium on Android.
 * A computer's Chrome offers it too, but Glitter is installed on phones.
 */
function canOfferPrompt(context: InstallContext) {
  return context.platform === "android-chromium";
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

/**
 * Step 1 on a computer: Glitter is installed on phones, so the page sends
 * the person to theirs, with a code the phone's camera opens.
 */
function OpenOnPhone({
  installUrl,
  qrSvg,
}: {
  installUrl: string;
  qrSvg: string | null;
}) {
  const shownUrl = installUrl.replace(/^https?:\/\//, "");
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {qrSvg && (
        <div
          role="img"
          aria-label={`Código QR que abre ${shownUrl}`}
          // White whatever the theme: a phone's camera reads dark on light.
          className="size-40 shrink-0 self-center rounded-lg bg-white p-2 sm:self-auto [&_svg]:size-full"
          // Drawn on the server by the qrcode library from our own address.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      )}
      <div className="space-y-2 text-sm leading-relaxed">
        <p className="flex items-start gap-2 font-medium">
          <SmartphoneIcon
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden
          />
          Glitter se instala en tu teléfono.
        </p>
        <p className="text-muted-foreground">
          {qrSvg
            ? "Escaneá este código con la cámara de tu teléfono y seguí los pasos que te aparecen ahí."
            : "Abrí esta página en tu teléfono y seguí los pasos que te aparecen ahí."}
        </p>
        <p className="text-muted-foreground">
          {qrSvg ? "O entrá desde el teléfono a " : "Entrá a "}
          <span className="font-medium text-foreground">{shownUrl}</span>
        </p>
      </div>
    </div>
  );
}

/** Step 1 for this device: the button where the browser offers one. */
function ThisDeviceInstall({
  context,
  installUrl,
  qrSvg,
}: {
  context: InstallContext;
  installUrl: string;
  qrSvg: string | null;
}) {
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

  if (context.platform === "desktop") {
    return <OpenOnPhone installUrl={installUrl} qrSvg={qrSvg} />;
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
        ¡Listo! Glitter quedó instalado. Abrilo desde su ícono en tu pantalla de
        inicio.
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

/**
 * Step 2: the tutorial, for everyone and whatever the flags say. Nobody is
 * asked to sign in here; that happens once they open the app. When this
 * phone can already turn notifications on (signed in, notifications open to
 * them, and not an iPhone outside the installed app), the control follows as
 * a shortcut.
 */
function NotificationsStep({
  context,
  pushAvailable,
  signedIn,
  publicKey,
  devices,
}: {
  context: InstallContext;
  pushAvailable: boolean;
  signedIn: boolean;
  publicKey: string | null;
  devices: PushDeviceRow[];
}) {
  const support = usePushSupport();
  const canTurnOnHere =
    pushAvailable &&
    signedIn &&
    context.platform !== "desktop" &&
    support !== "unknown" &&
    support !== "ios-needs-install" &&
    support !== "ios-in-app-browser";

  return (
    <div className="space-y-4">
      <InstallStepList guide={NOTIFICATIONS_GUIDE} />
      {canTurnOnHere && <PushControl publicKey={publicKey} devices={devices} />}
    </div>
  );
}

function InstallGuideViewTracker({
  pushAvailable,
  signedIn,
}: {
  pushAvailable: boolean;
  signedIn: boolean;
}) {
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    // Read here rather than from the render, whose first pass may still be
    // the server's guess.
    const context = detectInstallContext(window);
    captureClientEvent(POSTHOG_EVENTS.INSTALL_GUIDE_VIEWED, {
      platform: context.platform,
      browser: context.browser,
      push_available: pushAvailable,
      signed_in: signedIn,
    });
  }, [pushAvailable, signedIn]);
  return null;
}

/** Only on a phone's browser can "otro teléfono" be said. */
function isPhoneBrowser(context: InstallContext) {
  return (
    context.platform.startsWith("ios-") ||
    context.platform.startsWith("android-")
  );
}

/**
 * `/instalar`: install Glitter on this phone, then turn on its
 * notifications. The steps follow the phone; the other one is a tap away. A
 * computer is sent to its phone.
 */
export default function InstallGuide({
  pushAvailable,
  signedIn,
  publicKey,
  devices,
  installUrl,
  qrSvg,
  serverGuess,
}: {
  /** Notifications are open to this viewer and configured here. */
  pushAvailable: boolean;
  signedIn: boolean;
  publicKey: string | null;
  devices: PushDeviceRow[];
  /** This page's absolute address, for a computer to open on its phone. */
  installUrl: string;
  /** A QR code of `installUrl`, as SVG markup; null if it could not be drawn. */
  qrSvg: string | null;
  /** What the request's user agent says, until the browser can be asked. */
  serverGuess?: InstallContext;
}) {
  const context = useInstallContext(serverGuess);

  return (
    <div className="space-y-4">
      <InstallGuideViewTracker
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
        <ThisDeviceInstall
          context={context}
          installUrl={installUrl}
          qrSvg={qrSvg}
        />
      </section>

      {/* Always explained, flags or not; on a computer it is what to do on
          the phone. */}
      <section
        aria-labelledby="notifications-step-heading"
        className="space-y-4 rounded-lg border p-4 md:p-5"
      >
        <StepHeading number={2} id="notifications-step-heading">
          Activá las notificaciones
        </StepHeading>
        <NotificationsStep
          context={context}
          pushAvailable={pushAvailable}
          signedIn={signedIn}
          publicKey={publicKey}
          devices={devices}
        />
      </section>

      <section aria-labelledby="other-devices-heading" className="pt-2">
        <h2 id="other-devices-heading" className="mb-2 font-semibold">
          {isPhoneBrowser(context)
            ? "¿Usás otro teléfono?"
            : "Los pasos en cada teléfono"}
        </h2>
        <div className="divide-y rounded-lg border">
          {PHONE_GUIDES.filter(
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
