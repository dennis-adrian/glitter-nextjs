import "server-only";

import { auth } from "@clerk/nextjs/server";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { cache } from "react";

import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import {
  canSeeAdminNotifications,
  type InboxNotification,
  type InboxPage,
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_RETENTION_DAYS,
  type NotificationFilter,
  safeActionPath,
} from "@/app/lib/notifications/definitions";
import { notificationCreditDelta } from "@/app/lib/notifications/registry";
import { db } from "@/db";
import {
  notificationCampaignRecipients,
  notifications,
  users,
} from "@/db/schema";

export type InboxViewer = Pick<typeof users.$inferSelect, "id" | "role">;

/**
 * The signed-in user, from the session alone. The bell polls every minute, so
 * this reads Clerk's session claims instead of calling Clerk's API the way
 * `getCurrentUserProfile` does, and loads only the two columns it needs.
 */
export const resolveInboxViewer = cache(
  async (): Promise<InboxViewer | null> => {
    const { userId } = await auth();
    if (!userId) return null;
    const [row] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);
    return row ?? null;
  },
);

/** The viewer when the inbox is open to them, or null (signed out or flagged off). */
export async function resolveInboxViewerWithAccess(): Promise<InboxViewer | null> {
  const viewer = await resolveInboxViewer();
  if (!viewer) return null;
  return (await isFeatureEnabled("notifications", viewer)) ? viewer : null;
}

function retentionCutoff(now = new Date()) {
  return new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 86_400_000);
}

/** What any inbox read sees: the viewer's own, live, recent items. */
function visibleTo(viewer: InboxViewer, now = new Date()) {
  return and(
    eq(notifications.userId, viewer.id),
    isNull(notifications.archivedAt),
    gt(notifications.createdAt, retentionCutoff(now)),
    // Someone who stopped being an admin keeps no admin mail in view.
    canSeeAdminNotifications(viewer.role)
      ? undefined
      : ne(notifications.category, "admin"),
  );
}

export async function fetchUnreadNotificationCount(
  viewer: InboxViewer,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(visibleTo(viewer), isNull(notifications.readAt)));
  return Number(row?.count ?? 0);
}

type NotificationRow = typeof notifications.$inferSelect;

function toInboxNotification(row: NotificationRow): InboxNotification {
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    title: row.title,
    body: row.body,
    actionPath: safeActionPath(row.actionPath),
    actionLabel: row.actionLabel,
    creditDelta: notificationCreditDelta(row.kind, row.data),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function encodeCursor(row: NotificationRow) {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

function decodeCursor(value: string | null | undefined) {
  if (!value) return null;
  const [iso, id] = value.split("_");
  const createdAt = iso ? new Date(iso) : null;
  const numericId = Number(id);
  if (!createdAt || Number.isNaN(createdAt.getTime())) return null;
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  return { createdAt, id: numericId };
}

export async function fetchInboxPage(
  viewer: InboxViewer,
  options: {
    filter?: NotificationFilter;
    unreadOnly?: boolean;
    before?: string | null;
    limit?: number;
  } = {},
): Promise<InboxPage> {
  const limit = Math.min(
    Math.max(options.limit ?? NOTIFICATION_PAGE_SIZE, 1),
    50,
  );
  const cursor = decodeCursor(options.before);
  const filter = options.filter ?? "all";

  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        visibleTo(viewer),
        filter === "all" ? undefined : eq(notifications.category, filter),
        options.unreadOnly ? isNull(notifications.readAt) : undefined,
        cursor
          ? or(
              lt(notifications.createdAt, cursor.createdAt),
              and(
                eq(notifications.createdAt, cursor.createdAt),
                lt(notifications.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toInboxNotification),
    unreadCount: await fetchUnreadNotificationCount(viewer),
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
  };
}

export type NotificationDetail = InboxNotification & {
  /** The full gift message, when the item is about a gift. */
  message: string | null;
};

export async function fetchNotificationForViewer(
  viewer: InboxViewer,
  notificationId: number,
): Promise<NotificationDetail | null> {
  const [row] = await db
    .select()
    .from(notifications)
    .where(and(visibleTo(viewer), eq(notifications.id, notificationId)))
    .limit(1);
  if (!row) return null;
  const message =
    row.data && typeof row.data.message === "string" ? row.data.message : null;
  return { ...toInboxNotification(row), message };
}

export type PendingCelebration = {
  notificationIds: number[];
  totalCredits: number;
};

/**
 * Gifts the person has not been shown the banner for, added up. Independent of
 * the inbox flag: the banner, the wallet row and the email are how a gift
 * reaches participants before the bell does.
 */
export async function fetchPendingGiftCelebration(
  userId: number,
): Promise<PendingCelebration | null> {
  const rows = await db
    .select({ id: notifications.id, data: notifications.data })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.kind, "credit_gift_received"),
        isNull(notifications.celebratedAt),
        isNull(notifications.archivedAt),
        gt(notifications.createdAt, retentionCutoff()),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(20);
  if (rows.length === 0) return null;

  const total = rows.reduce(
    (sum, row) =>
      sum + (notificationCreditDelta("credit_gift_received", row.data) ?? 0),
    0,
  );
  return {
    notificationIds: rows.map((row) => row.id),
    totalCredits: Math.round(total * 100) / 100,
  };
}

/** For the wallet: each gift entry's personalised message, by ledger entry. */
export async function fetchGiftMessagesForLedgerEntries(
  userId: number,
  ledgerEntryIds: readonly number[],
) {
  const map = new Map<number, { title: string; message: string }>();
  if (ledgerEntryIds.length === 0) return map;
  const rows = await db
    .select({
      ledgerEntryId: notificationCampaignRecipients.ledgerEntryId,
      data: notifications.data,
    })
    .from(notificationCampaignRecipients)
    .innerJoin(
      notifications,
      eq(notifications.id, notificationCampaignRecipients.notificationId),
    )
    .where(
      and(
        eq(notificationCampaignRecipients.userId, userId),
        inArray(notificationCampaignRecipients.ledgerEntryId, [
          ...ledgerEntryIds,
        ]),
      ),
    );
  for (const row of rows) {
    const title = row.data?.title;
    const message = row.data?.message;
    if (
      row.ledgerEntryId != null &&
      typeof title === "string" &&
      typeof message === "string"
    ) {
      map.set(row.ledgerEntryId, { title, message });
    }
  }
  return map;
}
