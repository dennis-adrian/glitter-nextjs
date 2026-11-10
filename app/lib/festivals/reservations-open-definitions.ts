/**
 * The "reservations are open" notice's rules, shared by the festival page and
 * the server, which enforces them again.
 */

/** How the notice reaches participants. */
export type ReservationsOpenChannels = {
  email: boolean;
  /** The item in their Glitter notifications. */
  inApp: boolean;
  /** A push to devices with notifications on; opens the in-app item. */
  push: boolean;
};

/**
 * How late after the opening the automatic notice still goes out: room for a
 * few missed cron runs (every 5 minutes), never a late announcement.
 */
export const AUTOMATIC_WINDOW_MS = 60 * 60 * 1000;

/** Why these channels cannot be used, or null when they can. */
export function reservationsOpenChannelsProblem(
  channels: ReservationsOpenChannels,
): string | null {
  if (!channels.email && !channels.inApp) {
    return "Elige al menos el correo o la notificación en Glitter.";
  }
  if (channels.push && !channels.inApp) {
    return "La notificación push abre la notificación en Glitter: actívala también.";
  }
  return null;
}

/** "correo, Glitter y push" */
export function describeReservationsOpenChannels(
  channels: ReservationsOpenChannels,
): string {
  const parts = [
    channels.email ? "correo" : null,
    channels.inApp ? "Glitter" : null,
    channels.push ? "push" : null,
  ].filter((part): part is string => part !== null);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/** Whether reservations have opened, and whether the automatic notice can still go. */
export function reservationsOpenTiming(
  reservationsStartDate: Date,
  now: Date = new Date(),
) {
  const sinceOpening = now.getTime() - reservationsStartDate.getTime();
  return {
    reservationsOpen: sinceOpening >= 0,
    withinAutomaticWindow:
      sinceOpening >= 0 && sinceOpening <= AUTOMATIC_WINDOW_MS,
  };
}
