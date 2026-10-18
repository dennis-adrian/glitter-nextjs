import type { notificationCategoryEnum } from "@/db/schema";

/**
 * Client-safe shapes and labels for the inbox. Anything that renders email or
 * touches the database lives in the server-only modules next to this one.
 */

export type NotificationCategory =
  (typeof notificationCategoryEnum.enumValues)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  string
> = {
  reservations: "Reservas",
  credits: "Pagos y créditos",
  announcements: "Anuncios",
  account: "Cuenta",
  admin: "Administración",
};

/**
 * The inbox filters, in order. Four at most for a participant: more chips than
 * that stop reading as filters. `account` items only show under "Todas".
 */
export const NOTIFICATION_FILTERS = [
  "all",
  "reservations",
  "credits",
  "announcements",
  "admin",
] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export const NOTIFICATION_FILTER_LABELS: Record<NotificationFilter, string> = {
  all: "Todas",
  reservations: NOTIFICATION_CATEGORY_LABELS.reservations,
  credits: NOTIFICATION_CATEGORY_LABELS.credits,
  announcements: NOTIFICATION_CATEGORY_LABELS.announcements,
  admin: NOTIFICATION_CATEGORY_LABELS.admin,
};

/** "Administración" is the admin role's alone, as the admin emails are. */
export function canSeeAdminNotifications(role: string | null | undefined) {
  return role === "admin";
}

export function visibleNotificationFilters(
  role: string | null | undefined,
): NotificationFilter[] {
  return NOTIFICATION_FILTERS.filter(
    (filter) => filter !== "admin" || canSeeAdminNotifications(role),
  );
}

export function parseNotificationFilter(
  value: unknown,
  role: string | null | undefined,
): NotificationFilter {
  return typeof value === "string" &&
    (visibleNotificationFilters(role) as string[]).includes(value)
    ? (value as NotificationFilter)
    : "all";
}

/** Items older than this leave the inbox. Nothing is deleted. */
export const NOTIFICATION_RETENTION_DAYS = 180;

export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_POPOVER_SIZE = 8;

/** The sender every participant-facing message is signed with. */
export const NOTIFICATION_SENDER_NAME = "Productora Glitter";

/** What the inbox shows of one notification. Never carries an email address. */
export type InboxNotification = {
  id: number;
  kind: string;
  category: NotificationCategory;
  title: string;
  body: string;
  actionPath: string | null;
  actionLabel: string | null;
  /** Credits added, for the "+20" next to a gift. Null when nothing moved. */
  creditDelta: number | null;
  readAt: string | null;
  createdAt: string;
};

export type InboxPage = {
  items: InboxNotification[];
  unreadCount: number;
  /** Pass back as `before` to load the next page; null on the last one. */
  nextCursor: string | null;
};

/** The one place that turns a stored path into a link the inbox may follow. */
export function safeActionPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

/**
 * Where clicking an item goes. A message someone wrote opens its own page, so
 * it can be read whole; a system notice goes straight to what it is about.
 */
export function notificationHref(
  item: Pick<InboxNotification, "id" | "kind" | "actionPath">,
) {
  const detail = `/my_notifications/${item.id}`;
  if (item.kind === "credit_gift_received") return detail;
  return safeActionPath(item.actionPath) ?? detail;
}

export type NotificationDateGroup = "today" | "yesterday" | "week" | "earlier";

export const NOTIFICATION_DATE_GROUP_LABELS: Record<
  NotificationDateGroup,
  string
> = {
  today: "Hoy",
  yesterday: "Ayer",
  week: "Esta semana",
  earlier: "Anteriores",
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar days in the viewer's time zone, not 24-hour windows. */
export function notificationDateGroup(
  createdAt: Date,
  now = new Date(),
): NotificationDateGroup {
  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(createdAt).getTime()) / 86_400_000,
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  return "earlier";
}
