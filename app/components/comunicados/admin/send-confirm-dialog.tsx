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
  type ConfirmMode,
  confirmRows,
  confirmTitle,
  LOAD_FAILED_TEXT,
  SCHEDULE_FAILED_TEXT,
  SEND_FAILED_TEXT,
  typedCount,
  typedMatches,
  typedPrompt,
  VERSION_CHANGED_TEXT,
} from "@/app/components/comunicados/admin/send-confirm-copy";
import { SchedulePicker } from "@/app/components/molecules/schedule-dialog";
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
  ScheduleActionResult,
  SendComunicadoNowResult,
} from "@/app/lib/comunicados/contracts";
import { scheduleComunicadoAction } from "@/app/lib/comunicados/schedule-actions";
import {
  audienceAtReleaseText,
  SCHEDULE_DEVELOPMENT_REFUSAL,
  SCHEDULE_DIALOG_HINT,
  SCHEDULE_PREVIEW_NOTE,
  scheduleButtonLabel,
} from "@/app/lib/comunicados/schedule-copy";
import {
  SCHEDULE_DATE_MESSAGES,
  scheduleAtProblem,
} from "@/app/lib/comunicados/schedule-rules";
import {
  loadComunicadoSendConfirmationAction,
  sendComunicadoNowAction,
} from "@/app/lib/comunicados/send-actions";
import {
  defaultScheduleValue,
  parseStoreDateTimeLocal,
} from "@/app/lib/schedule-time";
import { cn } from "@/app/lib/utils";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; confirmation: ComunicadoSendConfirmation };

/** What either action answers, as the dialog handles it. */
type SubmitResult =
  | SendComunicadoNowResult
  | Exclude<ScheduleActionResult, { success: true }>;

/** A schedule never finds a send under way: its success is a new schedule. */
function asSubmitResult(result: ScheduleActionResult): SubmitResult {
  return result.success ? { ...result, alreadySent: false } : result;
}

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
  /**
   * The version the caller shows (the autosave's confirmed one in the
   * composer); null skips the check.
   */
  knownVersion: number | null;
  /**
   * What a newer version than `knownVersion` says: the composer's default
   * speaks of a draft changed in another tab.
   */
  versionChangedText?: string;
  /** Pauses the autosave; resolves with the function that resumes it. */
  onBeforeSend: () => Promise<() => void>;
  /** Called on a successful schedule too, with `alreadySent: false`. */
  onSent: (result: { alreadySent: boolean }) => void;
  /** "Enviar…" (default) or "Programar…", which picks a time on top. */
  mode?: ConfirmMode;
};

/**
 * "Enviar…" (docs/IMPLEMENTATION-comunicados.md G5): who receives the stored
 * draft and how, counted by the server when it opens, then "Enviar ahora".
 * A large audience or an essential send asks for the count to be typed; the
 * server checks it again, and a changed audience reloads the numbers here.
 *
 * "Programar…" is the same dialog with a time picked on top (E5): today's
 * numbers, as the audience is counted again at the release, and "Programar
 * para …" instead of "Enviar ahora". Development cannot schedule (E1).
 */
export default function SendConfirmDialog({
  comunicadoId,
  open,
  onOpenChange,
  knownVersion,
  versionChangedText = VERSION_CHANGED_TEXT,
  onBeforeSend,
  onSent,
  mode = "send",
}: SendConfirmDialogProps) {
  const router = useRouter();
  const typedId = useId();
  const pickerId = useId();
  const schedule = mode === "schedule";
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  /** Bumped to read the numbers again. */
  const [reads, setReads] = useState(0);
  const [typed, setTyped] = useState("");
  /** Why the last "Enviar ahora", or "Programar para …", did not go through. */
  const [refusal, setRefusal] = useState<string | null>(null);
  /** "Programar…": the picker's value, a La Paz date and time. */
  const [when, setWhen] = useState(() => defaultScheduleValue());
  /** Why that time will not do, by the clock when it was checked. */
  const [dateProblem, setDateProblem] = useState<string | null>(null);
  const [shownOpen, setShownOpen] = useState(open);

  // Each opening starts over: fresh numbers, nothing typed, no old refusal,
  // and the default time from now rather than from the last opening.
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) {
      setState({ status: "loading" });
      setTyped("");
      setRefusal(null);
      // An hour ahead at least, so there is nothing to check yet.
      setWhen(defaultScheduleValue());
      setDateProblem(null);
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
  const blocker = !confirmation
    ? null
    : schedule && confirmation.env === "development"
      ? SCHEDULE_DEVELOPMENT_REFUSAL
      : // Another tab saved after this one flushed: these numbers are not
        // for what is on screen here.
        knownVersion !== null && confirmation.version !== knownVersion
        ? versionChangedText
        : confirmation.problem;
  const typedOk =
    !confirmation?.typedRequired ||
    typedMatches(typed, confirmation.preview.eligible);
  const scheduledAt = schedule ? parseStoreDateTimeLocal(when) : null;
  const canSend =
    confirmation !== null && !blocker && !dateProblem && typedOk && !isPending;

  /** By the browser's clock; the server checks again with its own. */
  function timeProblem(picked: string) {
    const at = parseStoreDateTimeLocal(picked);
    return at
      ? scheduleAtProblem(at, Date.now())
      : SCHEDULE_DATE_MESSAGES.invalid;
  }

  function pickTime(picked: string) {
    setWhen(picked);
    setDateProblem(timeProblem(picked));
  }

  /** Sends the numbers shown now, or, given a time, schedules them for it. */
  function submit(shown: ComunicadoSendConfirmation, at: Date | null) {
    setRefusal(null);
    startTransition(async () => {
      // No save may reach the draft while it becomes a sent comunicado, or a
      // scheduled one.
      const resume = await onBeforeSend();
      const typedValue = shown.typedRequired ? typedCount(typed) : null;
      let result: SubmitResult;
      try {
        result = at
          ? asSubmitResult(
              await scheduleComunicadoAction({
                comunicadoId,
                expectedVersion: shown.version,
                scheduledAt: at.toISOString(),
                typedCount: typedValue,
              }),
            )
          : await sendComunicadoNowAction({
              comunicadoId,
              expectedVersion: shown.version,
              typedCount: typedValue,
            });
      } catch (error) {
        console.error(
          at ? "Error scheduling a comunicado" : "Error sending a comunicado",
          error,
        );
        setRefusal(at ? SCHEDULE_FAILED_TEXT : SEND_FAILED_TEXT);
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
      } else if (result.code === "INVALID_DATE") {
        // The server's clock on the time: under the picker, until the next
        // pick, as the browser's own check.
        setDateProblem(result.message);
      } else {
        // A schedule's DEVELOPMENT too.
        setRefusal(result.message);
      }
    });
  }

  const actionLabel = schedule
    ? isPending
      ? "Programando…"
      : scheduledAt
        ? scheduleButtonLabel(scheduledAt)
        : "Programar"
    : isPending
      ? "Enviando…"
      : "Enviar ahora";

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
            {confirmTitle(mode, confirmation?.title ?? null)}
          </AlertDialogTitle>
        </AlertDialogHeader>

        {schedule && (
          <SchedulePicker
            id={pickerId}
            value={when}
            onChange={pickTime}
            problem={dateProblem}
            disabled={isPending}
            hint={
              <div className="space-y-1">
                <p>{SCHEDULE_DIALOG_HINT}</p>
                {confirmation?.env === "preview" && (
                  <p>{SCHEDULE_PREVIEW_NOTE}</p>
                )}
              </div>
            }
          />
        )}

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

            {schedule && (
              <p className="text-sm text-muted-foreground">
                {audienceAtReleaseText(confirmation.preview.eligible)}
              </p>
            )}

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
              if (!confirmation || !canSend) return;
              if (!schedule) {
                submit(confirmation, null);
                return;
              }
              // The clock has moved on since the time was picked.
              const problem = timeProblem(when);
              setDateProblem(problem);
              if (!problem && scheduledAt) submit(confirmation, scheduledAt);
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
