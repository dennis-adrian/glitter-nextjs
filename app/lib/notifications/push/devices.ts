import "server-only";

import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import { pendingUserDeletions, pushSubscriptions, users } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Devices kept per person; saving one more drops the least recently used. */
export const MAX_PUSH_DEVICES_PER_USER = 10;

/** What the device list may show. Never the endpoint or keys. */
export type PushDevice = {
  id: number;
  label: string | null;
  createdAt: Date;
  lastUsedAt: Date;
};

export async function fetchPushDevices(userId: number): Promise<PushDevice[]> {
  return db
    .select({
      id: pushSubscriptions.id,
      label: pushSubscriptions.deviceLabel,
      createdAt: pushSubscriptions.createdAt,
      lastUsedAt: pushSubscriptions.lastUsedAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.lastUsedAt), desc(pushSubscriptions.id));
}

/**
 * Saves this browser's subscription for this person, or refreshes it. The
 * endpoint is unique: a browser last saved by someone else now belongs to
 * whoever is signed in, so the previous person's avisos stop arriving there.
 *
 * Changing owner takes the same keys as well as the endpoint. Only the browser
 * holding the subscription has them, so an endpoint seen elsewhere (a log, a
 * screenshot) cannot move someone's device. Null when refused.
 */
export async function savePushSubscription(input: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  applicationServerKey: string;
  label: string | null;
}): Promise<number | null | "deleting"> {
  return db.transaction(async (tx) => {
    // The lock profile deletion takes before it removes devices: either this
    // save commits first and is removed with the rest, or it sees the
    // pending deletion and saves nothing.
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("share");
    if (await hasPendingDeletion(input.userId, tx)) return "deleting";

    const [saved] = await tx
      .insert(pushSubscriptions)
      .values({
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        applicationServerKey: input.applicationServerKey,
        deviceLabel: input.label,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: input.userId,
          p256dh: input.p256dh,
          auth: input.auth,
          applicationServerKey: input.applicationServerKey,
          deviceLabel: input.label,
          lastUsedAt: sql`now()`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${pushSubscriptions.userId} = excluded.user_id
          OR (${pushSubscriptions.auth} = excluded.auth
            AND ${pushSubscriptions.p256dh} = excluded.p256dh)`,
      })
      .returning({ id: pushSubscriptions.id });
    if (!saved) return null;

    const keep = await tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, input.userId))
      .orderBy(desc(pushSubscriptions.lastUsedAt), desc(pushSubscriptions.id))
      .limit(MAX_PUSH_DEVICES_PER_USER);
    await tx.delete(pushSubscriptions).where(
      and(
        eq(pushSubscriptions.userId, input.userId),
        notInArray(
          pushSubscriptions.id,
          keep.map((row) => row.id),
        ),
      ),
    );
    return saved.id;
  });
}

/**
 * Refreshes this browser's row on a later visit, if the person still has it.
 * Never creates one: a device removed from the list stays removed until the
 * person turns avisos on there again. Returns the device id, or null.
 */
export async function refreshPushSubscription(input: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  applicationServerKey: string;
  label: string | null;
}): Promise<number | null> {
  const [refreshed] = await db
    .update(pushSubscriptions)
    .set({
      p256dh: input.p256dh,
      auth: input.auth,
      applicationServerKey: input.applicationServerKey,
      deviceLabel: input.label,
      lastUsedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(pushSubscriptions.endpoint, input.endpoint),
        eq(pushSubscriptions.userId, input.userId),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return refreshed?.id ?? null;
}

/**
 * Lets go of this browser's row when it belongs to someone else: the person
 * signed in now must not get the previous one's avisos here. The keys prove
 * this browser holds the subscription. Returns whether a row was removed.
 */
export async function releaseForeignPushSubscription(input: {
  userId: number;
  endpoint: string;
  auth: string;
}): Promise<boolean> {
  const released = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, input.endpoint),
        eq(pushSubscriptions.auth, input.auth),
        ne(pushSubscriptions.userId, input.userId),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return released.length > 0;
}

/** Removes some of a person's devices; anyone else's ids are ignored. */
export async function removePushSubscriptions(
  userId: number,
  where: { ids: number[] } | { endpoint: string },
): Promise<number> {
  const removed = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        "ids" in where
          ? inArray(pushSubscriptions.id, where.ids)
          : eq(pushSubscriptions.endpoint, where.endpoint),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return removed.length;
}

/**
 * Removes every device of a person whose profile is being deleted. Called in
 * the transaction that starts the deletion, under the user lock: Clerk goes
 * next, and from then on the person cannot sign in to see what a push says.
 */
export async function forgetPushDevices(tx: DbTx, userId: number) {
  await tx
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

/** Whether a person's profile is on its way out; see `lockCreditUserForMutation`. */
export async function hasPendingDeletion(
  userId: number,
  executor: Pick<typeof db, "select"> = db,
) {
  const [pending] = await executor
    .select({ id: pendingUserDeletions.id })
    .from(pendingUserDeletions)
    .where(
      and(
        eq(pendingUserDeletions.userId, userId),
        isNull(pendingUserDeletions.localDeletedAt),
      ),
    )
    .limit(1);
  return pending != null;
}
