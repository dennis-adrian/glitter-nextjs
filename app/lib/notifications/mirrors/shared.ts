import type {
  NotificationData,
  NotificationKind,
} from "@/app/lib/notifications/registry";

/** A kind and the snapshot it is written from, typed together. */
export type MirrorNotification = {
  [K in NotificationKind]: { kind: K; data: NotificationData<K> };
}[NotificationKind];

/**
 * What to log when an inbox copy fails: the Postgres code or the first line
 * of the message. A failed query's message goes on to list its parameters,
 * which here are names and the copy written for one person.
 */
export function mirrorFailureType(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code =
    (error as { code?: unknown }).code ??
    (error.cause as { code?: unknown } | undefined)?.code;
  if (typeof code === "string") return `pg:${code}`;
  return error.message.split("\n", 1)[0]!.slice(0, 160);
}
