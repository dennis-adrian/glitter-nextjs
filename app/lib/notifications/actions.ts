"use server";

import { and, eq, gt, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import {
  canSeeAdminNotifications,
  MAX_SERIAL_ID,
  NOTIFICATION_FILTERS,
} from "@/app/lib/notifications/definitions";
import {
  type InboxViewer,
  resolveInboxViewer,
  resolveInboxViewerWithAccess,
  retentionCutoff,
} from "@/app/lib/notifications/queries";
import {
  CELEBRATED_ON_READ,
  markNotificationRead,
} from "@/app/lib/notifications/read";
import { IMPERSONATION_READ_ONLY_RESULT } from "@/app/lib/impersonation/definitions";
import { isImpersonating } from "@/app/lib/impersonation/viewer";
import { countRefusal } from "@/db/write-guard";
import { db } from "@/db";
import { notifications } from "@/db/schema";

type ActionResult = { success: boolean; message?: string };

const idSchema = z.coerce.number().int().positive().max(MAX_SERIAL_ID);
/**
 * Generous on purpose: "Deshacer" sends back every id "Marcar todo" read, and
 * the 180-day window keeps that list far below this.
 */
const idsSchema = z.array(idSchema).min(1).max(5_000);
const filterSchema = z.enum(NOTIFICATION_FILTERS);

const UNAVAILABLE: ActionResult = {
  success: false,
  message: "Esta funcionalidad no está disponible",
};

/**
 * An inbox action the admin chose during a view: refused, and counted in the
 * view's audit. The automatic ones (reading on open, the gift banner) are
 * not counted: nobody tried them.
 */
async function refuseInView(): Promise<typeof IMPERSONATION_READ_ONLY_RESULT> {
  await countRefusal();
  return IMPERSONATION_READ_ONLY_RESULT;
}

function ownedBy(viewer: InboxViewer) {
  return eq(notifications.userId, viewer.id);
}

async function updateOne(
  idInput: unknown,
  values: Partial<typeof notifications.$inferInsert>,
): Promise<ActionResult> {
  if (await isImpersonating()) return refuseInView();
  const viewer = await resolveInboxViewerWithAccess();
  if (!viewer) return UNAVAILABLE;
  const parsed = idSchema.safeParse(idInput);
  if (!parsed.success) return { success: false, message: "Datos inválidos." };

  // Scoped to the owner in the statement itself: an id from someone else's
  // inbox updates nothing. Nor does a retracted item, from a stale client:
  // un-archiving it would hit the CHECK, and its read time is the report's.
  await db
    .update(notifications)
    .set(values)
    .where(
      and(
        eq(notifications.id, parsed.data),
        ownedBy(viewer),
        isNull(notifications.retractedAt),
      ),
    );
  return { success: true };
}

/** Opening an item reads it; the first read time is kept. */
export async function markNotificationReadAction(id: unknown) {
  const viewer = await resolveInboxViewerWithAccess();
  if (!viewer) return UNAVAILABLE;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { success: false, message: "Datos inválidos." };
  await markNotificationRead(viewer, parsed.data);
  return { success: true };
}

export async function markNotificationUnreadAction(id: unknown) {
  return updateOne(id, { readAt: null });
}

export async function archiveNotificationAction(id: unknown) {
  return updateOne(id, { archivedAt: new Date() });
}

/** Undo for "Archivar", from the toast. */
export async function unarchiveNotificationAction(id: unknown) {
  return updateOne(id, { archivedAt: null });
}

/**
 * Reads everything under one filter. Returns the ids it read, so the toast's
 * "Deshacer" puts back exactly those and nothing that arrived since.
 */
export async function markAllNotificationsReadAction(
  filterInput: unknown,
): Promise<ActionResult & { ids?: number[] }> {
  if (await isImpersonating()) return refuseInView();
  const viewer = await resolveInboxViewerWithAccess();
  if (!viewer) return UNAVAILABLE;
  const parsed = filterSchema.safeParse(filterInput ?? "all");
  if (!parsed.success) return { success: false, message: "Datos inválidos." };
  const filter = parsed.data;
  if (filter === "admin" && !canSeeAdminNotifications(viewer.role)) {
    return UNAVAILABLE;
  }

  const rows = await db
    .update(notifications)
    .set({ readAt: new Date(), celebratedAt: CELEBRATED_ON_READ })
    .where(
      and(
        ownedBy(viewer),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
        // Only what the inbox shows: items past retention stay as they were.
        gt(notifications.createdAt, retentionCutoff()),
        filter === "all" ? undefined : eq(notifications.category, filter),
        canSeeAdminNotifications(viewer.role)
          ? undefined
          : ne(notifications.category, "admin"),
      ),
    )
    .returning({ id: notifications.id });
  return { success: true, ids: rows.map((row) => row.id) };
}

export async function markNotificationsUnreadAction(
  idsInput: unknown,
): Promise<ActionResult> {
  if (await isImpersonating()) return refuseInView();
  const viewer = await resolveInboxViewerWithAccess();
  if (!viewer) return UNAVAILABLE;
  const parsed = idsSchema.safeParse(idsInput);
  if (!parsed.success) return { success: false, message: "Datos inválidos." };
  await db
    .update(notifications)
    .set({ readAt: null })
    .where(
      and(
        ownedBy(viewer),
        inArray(notifications.id, parsed.data),
        isNotNull(notifications.readAt),
        // Retracted since "Marcar todo" read it: the read time is the report's.
        isNull(notifications.retractedAt),
      ),
    );
  return { success: true };
}

/**
 * The celebration banner shows once. Not behind the inbox flag: the banner is
 * how a gift reaches a participant before the bell does.
 */
export async function markGiftsCelebratedAction(
  idsInput: unknown,
): Promise<ActionResult> {
  const viewer = await resolveInboxViewer();
  if (!viewer) return { success: false };
  const parsed = idsSchema.safeParse(idsInput);
  if (!parsed.success) return { success: false };
  // During a view the banner shows and stays the participant's to see: it
  // is called on mount, so it answers as if done rather than as refused.
  if (await isImpersonating()) return { success: true };
  await db
    .update(notifications)
    .set({ celebratedAt: new Date() })
    .where(
      and(
        ownedBy(viewer),
        inArray(notifications.id, parsed.data),
        eq(notifications.kind, "credit_gift_received"),
        isNull(notifications.celebratedAt),
      ),
    );
  return { success: true };
}
