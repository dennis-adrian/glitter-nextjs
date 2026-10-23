import "server-only";

import { and, eq, inArray, ne, or, sql } from "drizzle-orm";

import {
  buildInAppCopy,
  type NotificationKind,
  parseNotificationData,
} from "@/app/lib/notifications/registry";
import { db } from "@/db";
import { notifications } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

/** The same placeholder program purchases use for a deleted buyer. */
const DELETED_PROFILE_NAME = "Perfil eliminado";

/**
 * Kinds whose copy names someone other than its recipient, and the field
 * pairs that do it: the person's id and the name shown for them.
 */
const NAMED_PEOPLE = {
  reservation_created_admin: [["participantUserId", "participantName"]],
  reservation_proof_submitted_admin: [["participantUserId", "participantName"]],
  reservation_zero_value_review_requested_admin: [
    ["participantUserId", "participantName"],
  ],
  reservation_confirmed_with_credits_admin: [
    ["participantUserId", "participantName"],
  ],
  reservation_payment_deadline_extended: [["ownerUserId", "ownerName"]],
  reservation_released: [["ownerUserId", "ownerName"]],
  reservation_partner_added: [
    ["ownerUserId", "ownerName"],
    ["partnerUserId", "partnerName"],
  ],
} as const satisfies Partial<
  Record<NotificationKind, ReadonlyArray<readonly [string, string]>>
>;

type NamingKind = keyof typeof NAMED_PEOPLE;

const NAMING_KINDS = Object.keys(NAMED_PEOPLE) as NamingKind[];
const ID_KEYS = [
  ...new Set(
    Object.values(NAMED_PEOPLE).flatMap((pairs) =>
      pairs.map(([idKey]) => idKey),
    ),
  ),
];

/**
 * Takes a departing user's name out of other people's inbox items: an admin's
 * "Nueva reserva de Ana", a partner's "Ana liberó la reserva…". Their own
 * items go with the user row; these belong to someone else and would keep the
 * name for as long as the inbox shows them.
 *
 * The name becomes "Perfil eliminado" and the item is re-written from its
 * snapshot, so title and body say the same. One that no longer reads back is
 * archived instead. Must run before `DELETE FROM users`, next to the other
 * scrubs on that path.
 */
export async function scrubNotificationsNamingUser(
  executor: Executor,
  userId: number,
): Promise<number> {
  const rows = await executor
    .select({
      id: notifications.id,
      kind: notifications.kind,
      data: notifications.data,
    })
    .from(notifications)
    .where(
      and(
        inArray(notifications.kind, NAMING_KINDS),
        ne(notifications.userId, userId),
        or(
          ...ID_KEYS.map(
            (key) => sql`${notifications.data} ->> ${key} = ${String(userId)}`,
          ),
        ),
      ),
    );

  for (const row of rows) {
    const kind = row.kind as NamingKind;
    const data: Record<string, unknown> = { ...row.data };
    for (const [idKey, nameKey] of NAMED_PEOPLE[kind]) {
      if (data[idKey] !== userId) continue;
      data[idKey] = null;
      data[nameKey] = DELETED_PROFILE_NAME;
    }

    const parsed = parseNotificationData(kind, data);
    if (!parsed) {
      await executor
        .update(notifications)
        .set({ archivedAt: new Date() })
        .where(eq(notifications.id, row.id));
      continue;
    }
    const copy = buildInAppCopy(kind, parsed);
    await executor
      .update(notifications)
      .set({
        title: copy.title,
        body: copy.body,
        data: parsed as Record<string, unknown>,
      })
      .where(eq(notifications.id, row.id));
  }
  return rows.length;
}
