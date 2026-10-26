"use client";

import {
  BellOffIcon,
  FlaskConicalIcon,
  type LucideIcon,
  MailWarningIcon,
  SmartphoneIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";

import RetryButton from "@/app/components/comunicados/admin/composer/retry-button";
import {
  type ConfirmCallout,
  confirmCallouts,
  confirmRows,
  LOAD_FAILED_TEXT,
  SEND_FAILED_TEXT,
  typedCount,
  typedMatches,
  typedPrompt,
  VERSION_CHANGED_TEXT,
} from "@/app/components/comunicados/admin/send-confirm-copy";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Input } from "@/app/components/ui/input";
import { Skeleton } from "@/app/components/ui/skeleton";
import type {
  ComunicadoSendConfirmation,
  SendComunicadoNowResult,
} from "@/app/lib/comunicados/contracts";
import {
  loadComunicadoSendConfirmationAction,
  sendComunicadoNowAction,
} from "@/app/lib/comunicados/send-actions";
import { cn } from "@/app/lib/utils";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; confirmation: ComunicadoSendConfirmation };

const CALLOUT_TONES: Record<ConfirmCallout["tone"], string> = {
  amber:
    "border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-500/70 dark:bg-amber-950/40 dark:text-amber-100",
  blue: "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100",
  neutral: "border-border bg-muted/50 text-foreground",
};

const CALLOUT_ICONS: Record<ConfirmCallout["kind"], LucideIcon> = {
  essential: MailWarningIcon,
  push: SmartphoneIcon,
  environment: FlaskConicalIcon,
  bell: BellOffIcon,
};

function Callout({ callout }: { callout: ConfirmCallout }) {
  const Icon = CALLOUT_ICONS[callout.kind];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-3 text-sm",
        CALLOUT_TONES[callout.tone],
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
      <p>{callout.text}</p>
    </div>
  );
}

function Problem({ children }: { children: string }) {
  return (
    <p
      className="rounded-lg border border-[#E8356A] bg-[#E8356A]/10 p-3 text-sm"
      role="alert"
    >
      {children}
    </p>
  );
}

type SendConfirmDialogProps = {
  comunicadoId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The autosave's confirmed version; null skips the check. */
  knownVersion: number | null;
  /** Pauses the autosave; resolves with the function that resumes it. */
  onBeforeSend: () => Promise<() => void>;
  onSent: (result: { alreadySent: boolean }) => void;
};

/**
 * "Enviar…" (docs/IMPLEMENTATION-comunicados.md G5): who receives the stored
 * draft and how, counted by the server when it opens, then "Enviar ahora".
 * A large audience or an essential send asks for the count to be typed; the
 * server checks it again, and a changed audience reloads the numbers here.
 */
export default function SendConfirmDialog({
  comunicadoId,
  open,
  onOpenChange,
  knownVersion,
  onBeforeSend,
  onSent,
}: SendConfirmDialogProps) {
  const router = useRouter();
  const typedId = useId();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  /** Bumped to read the numbers again. */
  const [reads, setReads] = useState(0);
  const [typed, setTyped] = useState("");
  /** Why the last "Enviar ahora" did not send. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const [shownOpen, setShownOpen] = useState(open);

  // Each opening starts over: fresh numbers, nothing typed, no old refusal.
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) {
      setState({ status: "loading" });
      setTyped("");
      setRefusal(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let current = true;
    loadComunicadoSendConfirmationAction(comunicadoId)
      .then((result) => {
        if (!current) return;
        setState(
          result.success
            ? { status: "ready", confirmation: result.confirmation }
            : { status: "error", message: result.message },
        );
      })
      .catch((error: unknown) => {
        console.error("Error counting a comunicado's recipients", error);
        if (current) setState({ status: "error", message: LOAD_FAILED_TEXT });
      });
    return () => {
      current = false;
    };
  }, [open, comunicadoId, reads]);

  function reload() {
    setState({ status: "loading" });
    setTyped("");
    setReads((count) => count + 1);
  }

  const confirmation = state.status === "ready" ? state.confirmation : null;
  // Another tab saved after this one flushed: these numbers are not for
  // what is on screen here.
  const blocker = !confirmation
    ? null
    : knownVersion !== null && confirmation.version !== knownVersion
      ? VERSION_CHANGED_TEXT
      : confirmation.problem;
  const typedOk =
    !confirmation?.typedRequired ||
    typedMatches(typed, confirmation.preview.eligible);
  const canSend = confirmation !== null && !blocker && typedOk && !isPending;

  function send(shown: ComunicadoSendConfirmation) {
    setRefusal(null);
    startTransition(async () => {
      // No save may reach the draft while it becomes a sent comunicado.
      const resume = await onBeforeSend();
      let result: SendComunicadoNowResult;
      try {
        result = await sendComunicadoNowAction({
          comunicadoId,
          expectedVersion: shown.version,
          typedCount: shown.typedRequired ? typedCount(typed) : null,
        });
      } catch (error) {
        console.error("Error sending a comunicado", error);
        setRefusal(SEND_FAILED_TEXT);
        resume();
        return;
      }

      if (result.success) {
        onSent({ alreadySent: result.alreadySent });
        toast.success(result.message);
        onOpenChange(false);
        return;
      }
      resume();
      if (result.code === "AUDIENCE_CHANGED") {
        // The server's new count: read every number again, and type it anew.
        setRefusal(result.message);
        reload();
      } else if (result.code === "STALE") {
        toast.error(result.message);
        onOpenChange(false);
        router.refresh();
      } else {
        setRefusal(result.message);
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !isPending && onOpenChange(next)}
    >
      <AlertDialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        // The numbers below say it all; there is no separate description.
        aria-describedby={undefined}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {confirmation
              ? `¿Enviar «${confirmation.title}»?`
              : "¿Enviar este comunicado?"}
          </AlertDialogTitle>
        </AlertDialogHeader>

        {state.status === "loading" && (
          <div className="space-y-2" aria-busy="true">
            <p className="text-sm text-muted-foreground" role="status">
              Contando destinatarios…
            </p>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}

        {state.status === "error" && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {state.message}
            </p>
            <RetryButton onRetry={reload} />
          </div>
        )}

        {confirmation && (
          <>
            <dl className="divide-y rounded-lg border text-sm">
              {confirmRows(confirmation).map((row) => (
                <div
                  key={row.label}
                  className="grid gap-0.5 px-3 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3"
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd
                    className={cn(
                      "tabular-nums",
                      row.strong && "font-semibold",
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            {confirmCallouts(confirmation).map((callout) => (
              <Callout key={callout.kind} callout={callout} />
            ))}

            {blocker ? (
              <Problem>{blocker}</Problem>
            ) : (
              confirmation.typedRequired && (
                <div className="space-y-2">
                  <label htmlFor={typedId} className="text-sm">
                    {typedPrompt(confirmation.preview.eligible)}
                  </label>
                  <Input
                    id={typedId}
                    inputMode="numeric"
                    autoComplete="off"
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    disabled={isPending}
                  />
                </div>
              )
            )}
          </>
        )}

        {refusal && <Problem>{refusal}</Problem>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSend}
            onClick={(event) => {
              // Stays open, and busy, until the server answers: a refusal is
              // read here, next to the numbers it is about.
              event.preventDefault();
              if (confirmation && canSend) send(confirmation);
            }}
          >
            {isPending ? "Enviando…" : "Enviar ahora"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
