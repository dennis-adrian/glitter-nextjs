import { DateTime } from "luxon";

import { STORE_TIMEZONE } from "@/app/lib/formatters";

/**
 * The failure summary at the top of the admin notification log: how many
 * emails and pushes failed in the last 24 hours, and whether many of them
 * failed the same way at once, which points at our configuration (VAPID
 * keys, a push payload, the Resend key or domain) rather than at one broken
 * device or address. Shared by the server read and the page, so nothing here
 * imports server code.
 *
 * A failure is a row with status `failed`: a delivery, or a job of one of
 * the two outboxes. Skips are not failures (a device that dropped its
 * subscription, a suppressed address, a retracted item), and neither is a
 * row still being retried. A disciplinary job closed because its person
 * deleted their profile is marked failed but is routine, so it is left out.
 */

export const FAILURE_WINDOW_HOURS = 24;

/**
 * The pattern: at least this many different recipients (addresses or
 * devices) failing with the same error, on the same channel and, for a
 * push, the same push service, within `FAILURE_PATTERN_WINDOW_MINUTES` of
 * each other. One device or address failing again and again is one
 * recipient, so it never trips it.
 */
export const FAILURE_PATTERN_MIN_RECIPIENTS = 5;
export const FAILURE_PATTERN_WINDOW_MINUTES = 60;

/** Outbox errors that are marked failed but say nothing is wrong. */
export const ROUTINE_FAILURE_ERRORS = ["profile_deleted"] as const;

export type FailureChannel = "email" | "push";

/** Which push service a device's endpoint belongs to, never the endpoint. */
export const PUSH_PLATFORMS = [
  "fcm",
  "apple",
  "mozilla",
  "wns",
  "other",
  "unknown",
] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export const PUSH_PLATFORM_LABELS: Record<PushPlatform, string> = {
  fcm: "Chrome y Android",
  apple: "Safari y iPhone",
  mozilla: "Firefox",
  wns: "Edge en Windows",
  other: "otro servicio push",
  unknown: "dispositivos ya eliminados",
};

/** One recipient's failures with one error, as the server reads them. */
export type FailurePoint = {
  channel: FailureChannel;
  error: string;
  /** Push only. */
  platform: PushPlatform | null;
  /** An opaque key for the address or device; never sent to the page. */
  recipient: string;
  /** Its first failure with this error in the window. */
  firstAt: Date;
  failures: number;
};

export type FailurePattern = {
  channel: FailureChannel;
  error: string;
  platform: PushPlatform | null;
  /** Different recipients in the busiest stretch. */
  recipients: number;
  /** Their failures with this error over the whole 24 hours. */
  failures: number;
  from: Date;
  to: Date;
};

export type NotificationFailureSummary = {
  since: Date;
  until: Date;
  counts: Record<FailureChannel, number>;
  patterns: FailurePattern[];
};

/**
 * The patterns among `points`, biggest first. Each group (channel, error,
 * push service) is scanned for the stretch of at most the window's length
 * with the most recipients whose first failure falls in it.
 */
export function detectFailurePatterns(
  points: readonly FailurePoint[],
  {
    minRecipients = FAILURE_PATTERN_MIN_RECIPIENTS,
    windowMinutes = FAILURE_PATTERN_WINDOW_MINUTES,
  }: { minRecipients?: number; windowMinutes?: number } = {},
): FailurePattern[] {
  const windowMs = windowMinutes * 60_000;
  const groups = new Map<string, FailurePoint[]>();
  for (const point of points) {
    const key = JSON.stringify([point.channel, point.error, point.platform]);
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }

  const patterns: FailurePattern[] = [];
  for (const group of groups.values()) {
    // One point per recipient: a recipient read twice counts once, early.
    const firstByRecipient = new Map<string, FailurePoint>();
    let failures = 0;
    for (const point of group) {
      failures += point.failures;
      const seen = firstByRecipient.get(point.recipient);
      if (!seen || point.firstAt < seen.firstAt) {
        firstByRecipient.set(point.recipient, point);
      }
    }
    if (firstByRecipient.size < minRecipients) continue;
    const times = [...firstByRecipient.values()]
      .map((point) => point.firstAt.getTime())
      .sort((a, b) => a - b);

    let best = { size: 0, from: 0, to: 0 };
    let start = 0;
    for (let end = 0; end < times.length; end += 1) {
      while (times[end]! - times[start]! > windowMs) start += 1;
      const size = end - start + 1;
      if (size > best.size) {
        best = { size, from: times[start]!, to: times[end]! };
      }
    }
    if (best.size < minRecipients) continue;
    const sample = group[0]!;
    patterns.push({
      channel: sample.channel,
      error: sample.error,
      platform: sample.platform,
      recipients: best.size,
      failures,
      from: new Date(best.from),
      to: new Date(best.to),
    });
  }
  return patterns.sort(
    (a, b) => b.recipients - a.recipients || b.failures - a.failures,
  );
}

/**
 * The log filtered to one channel's failures, over the Bolivian days the
 * 24 hours touch: the list filters by day, so it can also show failures
 * from earlier that first day.
 */
export function failureListHref(channel: FailureChannel, until: Date) {
  const to = DateTime.fromJSDate(until, { zone: STORE_TIMEZONE });
  const from = to.minus({ hours: FAILURE_WINDOW_HOURS });
  const params = new URLSearchParams({
    channel,
    status: "failed",
    from: from.toISODate()!,
    to: to.toISODate()!,
  });
  return `/dashboard/notifications?${params.toString()}`;
}

/** What a pattern's error most likely means, in the admin's words. */
export function failurePatternHint(pattern: FailurePattern): string {
  if (pattern.channel === "push") {
    return /^push_(400|401|403|413)$/.test(pattern.error)
      ? "Suele ser un problema de configuración: las claves VAPID o el contenido del aviso."
      : "Suele ser un problema del servicio push o de nuestra configuración, no de un dispositivo.";
  }
  return "Suele ser un problema de configuración del envío de correos (la clave o el dominio en Resend), no de una dirección.";
}
