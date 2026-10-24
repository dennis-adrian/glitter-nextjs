/**
 * What a push carries to the service worker. Built from the stored inbox item
 * at send time, so a scrub or an archive that happened after `notify()` is
 * respected.
 *
 * `v` lets an older worker still installed on a device recognise a payload it
 * understands while an update rolls out.
 */
export type PushPayload = {
  v: 1;
  id: number;
  title: string;
  body: string;
  /** Opens Glitter on the item: marks it read, then redirects to `href`. */
  url: string;
  /**
   * Where the tap lands, for a Glitter already open: it goes there without
   * reloading, and reads the item itself. Added after the first workers
   * shipped, which ignore it.
   */
  href: string;
  tag: string;
};

/** What a disciplinary notice says on a lock screen: that it arrived, not what. */
export const SENSITIVE_PUSH_TITLE = "Glitter";
export const SENSITIVE_PUSH_BODY = "Tenés una notificación nueva";
/**
 * The body of an item carrying text someone wrote (a gift's message, a
 * cancellation reason): the title says what happened, the text stays on its
 * page. A lock screen cannot be recalled or rewritten, and the person who
 * wrote it was told it goes to the inbox and the email.
 */
export const WRITTEN_TEXT_PUSH_BODY = "Tocá para ver el detalle.";

/**
 * Push services must accept 4096 encrypted bytes, and aes128gcm's header, tag
 * and delimiter take about 100 of them. These caps keep the JSON well under
 * that even when every character is a 4-byte emoji or needs escaping.
 */
export const MAX_PUSH_TITLE_LENGTH = 120;
export const MAX_PUSH_BODY_LENGTH = 240;

/** Cuts to `max` characters (code points, so no half emoji) with an ellipsis. */
function truncate(value: string, max: number) {
  const chars = Array.from(value.trim());
  if (chars.length <= max) return chars.join("");
  return `${chars
    .slice(0, max - 1)
    .join("")
    .trimEnd()}…`;
}

/**
 * Tapping a push opens the item as tapping it in the inbox does: marked read,
 * then its screen, or its own page when it carries text someone wrote or is
 * a disciplinary notice. The route does both, so it works however the
 * device opens Glitter.
 */
export function pushNotificationUrl(notificationId: number) {
  return `/my_notifications/${notificationId}/open`;
}

export function buildPushPayload(item: {
  id: number;
  title: string;
  body: string;
  sensitive: boolean;
  /** The item opens its own page because it carries written text. */
  writtenText: boolean;
  /** Where a tap lands (`notificationTapHref`). */
  href: string;
}): string {
  const base = {
    v: 1 as const,
    id: item.id,
    url: pushNotificationUrl(item.id),
    href: item.href,
    tag: `notification-${item.id}`,
  };
  if (item.sensitive) {
    return JSON.stringify({
      ...base,
      title: SENSITIVE_PUSH_TITLE,
      body: SENSITIVE_PUSH_BODY,
    } satisfies PushPayload);
  }

  // Only the first paragraph: later ones hold notes and reasons.
  const body = item.writtenText
    ? WRITTEN_TEXT_PUSH_BODY
    : truncate(item.body.split(/\n\s*\n/)[0] ?? "", MAX_PUSH_BODY_LENGTH);
  return JSON.stringify({
    ...base,
    title: truncate(item.title, MAX_PUSH_TITLE_LENGTH),
    body,
  } satisfies PushPayload);
}

/**
 * Collapses a still-undelivered copy of the same item at the push service
 * (RFC 8030 `Topic`: at most 32 URL-safe characters). One per item, never per
 * kind, which would drop distinct events.
 */
export function pushTopic(notificationId: number) {
  return `n${notificationId}`;
}
