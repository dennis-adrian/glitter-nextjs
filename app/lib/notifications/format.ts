import { DateTime } from "luxon";

/** "hace 5 minutos", "ayer", "hace 3 días": how long ago, in Spanish. */
export function formatNotificationTime(
  createdAt: string | Date,
  now: Date = new Date(),
): string {
  const date =
    typeof createdAt === "string"
      ? DateTime.fromISO(createdAt)
      : DateTime.fromJSDate(createdAt);
  if (!date.isValid) return "";
  const seconds = DateTime.fromJSDate(now).diff(date, "seconds").seconds;
  if (seconds < 60) return "recién";
  return (
    date.setLocale("es").toRelative({ base: DateTime.fromJSDate(now) }) ?? ""
  );
}

/** "+20" next to a gift, "−20" next to its revocation. */
export function formatCreditDelta(delta: number): string {
  const count = Number.isInteger(delta)
    ? String(Math.abs(delta))
    : Math.abs(delta).toFixed(2);
  return `${delta > 0 ? "+" : "−"}${count}`;
}
