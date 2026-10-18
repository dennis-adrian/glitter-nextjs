"use server";

import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import {
  canSeeAdminNotifications,
  NOTIFICATION_FILTERS,
} from "@/app/lib/notifications/definitions";
import {
  type InboxViewer,
  resolveInboxViewer,
  resolveInboxViewerWithAccess,
} from "@/app/lib/notifications/queries";
import { db } from "@/db";
import { notifications } from "@/db/schema";

type ActionResult = { success: boolean; message?: string };

const idSchema = z.coerce.number().int().positive();
const idsSchema = z.array(idSchema).min(1).max(500);
const filterSchema = z.enum(NOTIFICATION_FILTERS);

const UNAVAILABLE: ActionResult = {
  success: false,
  message: "Esta funcionalidad no está disponible",
};

function ownedBy(viewer: InboxViewer) {
  return eq(notifications.userId, viewer.id);
}

async function updateOne(
  idInput: unknown,
  values: Partial<typeof notifications.$inferInsert>,
): Promise<ActionResult> {
  const viewer = await resolveInboxViewerWithAccess();
  if (!viewer) return UNAVAILABLE;
  const parsed = idSchema.safeParse(idInput);
  if (!parsed.success) return { success: false, message: "Datos inválidos." };

  // Scoped to the owner in the statement itself: an id from someone else's
  // inbox updates nothing.
  await db
    .update(notifications)
    .set(values)
    .where(and(eq(notifications.id, parsed.data), ownedBy(viewer)));
  return { success: true };
}

/** Opening an item reads it; the first read time is kept. */
export async function markNotificationReadAction(id: unknown) {
  const viewer = await resolveInboxViewerWithAccess();
  if (!viewer) return UNAVAILABLE;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { success: false, message: "Datos inválidos." };
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, parsed.data),
        ownedBy(viewer),
        isNull(notifications.readAt),
      ),
    );
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
    .set({ readAt: new Date() })
    .where(
      and(
        ownedBy(viewer),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
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
