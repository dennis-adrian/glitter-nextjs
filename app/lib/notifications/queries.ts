import "server-only";

import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { cache } from "react";

import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import {
  canSeeAdminNotifications,
  type InboxNotification,
  type InboxPage,
  NOTIFICATION_PAGE_SIZE,
  MAX_SERIAL_ID,
  NOTIFICATION_RETENTION_DAYS,
  type NotificationFilter,
  safeActionPath,
} from "@/app/lib/notifications/definitions";
import {
  notificationCreditDelta,
  notificationOpensDetail,
} from "@/app/lib/notifications/registry";
import { db } from "@/db";
import {
  comunicadoRevisions,
  comunicados,
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

/** Items older than this leave the inbox; every read and write shares it. */
export function retentionCutoff(now = new Date()) {
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

function inFilter(filter: NotificationFilter) {
  return filter === "all" ? undefined : eq(notifications.category, filter);
}

export async function fetchUnreadNotificationCount(
  viewer: InboxViewer,
  filter: NotificationFilter = "all",
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(visibleTo(viewer), inFilter(filter), isNull(notifications.readAt)),
    );
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
    opensDetail: notificationOpensDetail(row.kind, row.data),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

/**
 * The cursor is the last id shown. Ids follow insertion order, which is the
 * order the inbox shows; a timestamp cursor lost the microseconds a JS Date
 * cannot hold, and with them every row sharing the boundary row's
 * millisecond.
 */
function decodeCursor(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id > 0 && id <= MAX_SERIAL_ID ? id : null;
}

async function hasNoVisibleNotifications(viewer: InboxViewer) {
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(visibleTo(viewer))
    .limit(1);
  return !row;
}

/**
 * Whether the viewer has an anuncio in view. The "Anuncios" chip waits for
 * one, so it shows the moment the first arrives and never empty (H1).
 */
export async function hasVisibleAnnouncements(
  viewer: InboxViewer,
): Promise<boolean> {
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(visibleTo(viewer), eq(notifications.category, "announcements")))
    .limit(1);
  return row != null;
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
  const before = decodeCursor(options.before);
  const filter = options.filter ?? "all";

  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        visibleTo(viewer),
        inFilter(filter),
        options.unreadOnly ? isNull(notifications.readAt) : undefined,
        before ? lt(notifications.id, before) : undefined,
      ),
    )
    .orderBy(desc(notifications.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const [unreadCount, isEmptyInbox] = await Promise.all([
    fetchUnreadNotificationCount(viewer, filter),
    // Only worth asking when this page came back empty.
    page.length === 0 ? hasNoVisibleNotifications(viewer) : false,
  ]);
  return {
    items: page.map(toInboxNotification),
    unreadCount,
    isEmptyInbox,
    nextCursor: rows.length > limit && last ? String(last.id) : null,
  };
}

export type NotificationDetail = InboxNotification & {
  /** The full gift message, when the item is about a gift. */
  message: string | null;
  /**
   * A comunicado's text as it reads now: its current revision's sanitized
   * HTML. Null for every other kind, whose page shows `message` or `body`.
   */
  bodyHtml: string | null;
};

/** The kinds whose snapshot keeps a message longer than the inbox body. */
const KINDS_WITH_MESSAGE: ReadonlySet<string> = new Set([
  "credit_gift_received",
]);

/**
 * The current revision's HTML of the comunicado this item delivered (H2), so
 * an edit reaches the page without rewriting anyone's row. The comunicado has
 * to be the one the item's campaign sent, not just any id in `data`.
 */
async function comunicadoBodyHtml(
  row: NotificationRow,
): Promise<string | null> {
  const comunicadoId = row.data?.comunicadoId;
  if (
    row.campaignId == null ||
    typeof comunicadoId !== "number" ||
    !Number.isInteger(comunicadoId) ||
    comunicadoId < 1 ||
    comunicadoId > MAX_SERIAL_ID
  ) {
    return null;
  }
  const [revision] = await db
    .select({ html: comunicadoRevisions.html })
    .from(comunicados)
    .innerJoin(
      comunicadoRevisions,
      and(
        eq(comunicadoRevisions.comunicadoId, comunicados.id),
        eq(comunicadoRevisions.revision, comunicados.currentRevision),
      ),
    )
    .where(
      and(
        eq(comunicados.id, comunicadoId),
        eq(comunicados.campaignId, row.campaignId),
      ),
    )
    .limit(1);
  return revision?.html ?? null;
}

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
    KINDS_WITH_MESSAGE.has(row.kind) && typeof row.data?.message === "string"
      ? row.data.message
      : null;
  const bodyHtml =
    row.kind === "comunicado" ? await comunicadoBodyHtml(row) : null;
  return { ...toInboxNotification(row), message, bodyHtml };
}

export type PendingCelebration = {
  notificationIds: number[];
  totalCredits: number;
};

/**
 * Gifts the person has not been shown the banner for, added up. Independent of
 * the inbox flag: the banner, the wallet row and the email are how a gift
 * reaches participants before the bell does. Not a gift they already opened
 * (from the inbox, or a tap on the device): it has nothing left to announce.
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
        isNull(notifications.readAt),
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
