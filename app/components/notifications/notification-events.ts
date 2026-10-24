"use client";

const NOTIFICATIONS_CHANGED = "glitter:notifications-changed";

/**
 * Tells the bell and the inbox that something changed out of their sight:
 * read or archive state elsewhere on the page (the inbox, a detail page, an
 * undo), or a notification that just arrived (the service worker says so).
 * They ask again instead of waiting for the next poll or return. Call it
 * after the action resolves.
 */
export function announceNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function onNotificationsChanged(listener: () => void) {
  window.addEventListener(NOTIFICATIONS_CHANGED, listener);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED, listener);
}
