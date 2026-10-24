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

const NOTIFICATION_RECEIVED = "glitter:notification-received";

/**
 * An aviso reached this browser while Glitter is open (the service worker
 * says so): the inbox on screen asks for its first page again, and the bell
 * for its count.
 */
export function announceNotificationReceived() {
  window.dispatchEvent(new Event(NOTIFICATION_RECEIVED));
  announceNotificationsChanged();
}

export function onNotificationReceived(listener: () => void) {
  window.addEventListener(NOTIFICATION_RECEIVED, listener);
  return () => window.removeEventListener(NOTIFICATION_RECEIVED, listener);
}
