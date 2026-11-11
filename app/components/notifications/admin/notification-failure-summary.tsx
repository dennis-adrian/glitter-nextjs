import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";

import {
  formatDate,
  formatDateWithTime,
  formatTime,
} from "@/app/lib/formatters";
import {
  FAILURE_PATTERN_MIN_RECIPIENTS,
  FAILURE_PATTERN_WINDOW_MINUTES,
  type FailureChannel,
  failureListHref,
  failurePatternHint,
  type FailurePattern,
  type NotificationFailureSummary,
  PUSH_PLATFORM_LABELS,
} from "@/app/lib/notifications/admin-log-failures-definitions";

const CHANNELS: { channel: FailureChannel; label: string }[] = [
  { channel: "email", label: "Correos" },
  { channel: "push", label: "Avisos push" },
];

export const FAILURE_PATTERN_RULE = `Avisamos cuando ${FAILURE_PATTERN_MIN_RECIPIENTS} o más correos o dispositivos distintos fallan con el mismo error en menos de ${FAILURE_PATTERN_WINDOW_MINUTES} minutos (en avisos push, con el mismo servicio). Un solo dispositivo o correo que falla muchas veces no cuenta.`;

function patternText(pattern: FailurePattern) {
  const who =
    pattern.channel === "push"
      ? `${pattern.recipients} dispositivos de ${PUSH_PLATFORM_LABELS[pattern.platform ?? "unknown"]}`
      : `${pattern.recipients} direcciones de correo`;
  const sameDay = formatDate(pattern.from).hasSame(
    formatDate(pattern.to),
    "day",
  );
  const when = sameDay
    ? `entre las ${formatTime(pattern.from)} y las ${formatTime(pattern.to)}`
    : `entre el ${formatDateWithTime(pattern.from)} y el ${formatDateWithTime(pattern.to)}`;
  return `${who} fallaron con «${pattern.error}» ${when}.`;
}

/**
 * The top of the log: failures in the last 24 hours by channel, each linked
 * to the list filtered to them, and a warning when many failed the same way
 * at once. Routine skips are not failures, so they are not counted.
 */
export default function NotificationFailureSummaryPanel({
  summary,
}: {
  summary: NotificationFailureSummary;
}) {
  const total = summary.counts.email + summary.counts.push;
  return (
    <section
      aria-labelledby="notification-failures-title"
      className="shrink-0 space-y-2 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2
          id="notification-failures-title"
          className="font-medium break-words"
        >
          {total === 0
            ? "Sin fallas en las últimas 24 horas"
            : "Fallas en las últimas 24 horas"}
        </h2>
        {total > 0
          ? CHANNELS.map(({ channel, label }) =>
              summary.counts[channel] > 0 ? (
                <Link
                  key={channel}
                  href={failureListHref(channel, summary.until)}
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-medium text-destructive underline-offset-2 hover:underline"
                >
                  {label}: {summary.counts[channel]}
                </Link>
              ) : (
                <span
                  key={channel}
                  className="rounded-md border px-2 py-0.5 text-muted-foreground"
                >
                  {label}: 0
                </span>
              ),
            )
          : null}
      </div>

      {summary.patterns.length > 0 ? (
        <div
          role="alert"
          className="space-y-1 rounded-md border border-destructive/50 bg-destructive/10 p-3"
        >
          <p className="flex items-start gap-2 font-medium text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              Muchos envíos fallaron igual: puede ser un problema de
              configuración.
            </span>
          </p>
          <ul className="space-y-1 pl-6">
            {summary.patterns.slice(0, 3).map((pattern) => (
              <li
                key={`${pattern.channel}:${pattern.platform}:${pattern.error}`}
                className="break-words"
              >
                {patternText(pattern)}{" "}
                <span className="text-muted-foreground">
                  {failurePatternHint(pattern)}
                </span>
              </li>
            ))}
          </ul>
          {/* Closed by default, so on a phone the list stays close. */}
          <details className="pl-6 text-xs text-muted-foreground">
            <summary className="cursor-pointer">¿Cuándo avisamos?</summary>
            <p className="mt-1 break-words">{FAILURE_PATTERN_RULE}</p>
          </details>
        </div>
      ) : null}
    </section>
  );
}
