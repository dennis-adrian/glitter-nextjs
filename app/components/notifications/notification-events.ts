"use client";

const NOTIFICATIONS_CHANGED = "glitter:notifications-changed";

/**
 * Tells the bell that read or archive state changed somewhere else on the
 * page (the inbox, a detail page, an undo), so its badge asks again instead
 * of waiting for the next minute's poll. Call it after the action resolves.
 */
export function announceNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function onNotificationsChanged(listener: () => void) {
  window.addEventListener(NOTIFICATIONS_CHANGED, listener);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED, listener);
}
