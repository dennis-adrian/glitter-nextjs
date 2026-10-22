import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { fetchFeatureFlagRule } from "@/app/lib/feature_flags/data";
import {
  type FeatureFlagRule,
  type FeatureFlagViewer,
  isFeatureVisible,
} from "@/app/lib/feature_flags/visibility";
import { canSeeAdminNotifications } from "@/app/lib/notifications/definitions";
import { pushVapidConfig } from "@/app/lib/notifications/push/config";
import {
  isAllowedPushEndpoint,
  pushEndpointHost,
} from "@/app/lib/notifications/push/endpoint";
import {
  buildPushPayload,
  pushTopic,
} from "@/app/lib/notifications/push/payload";
import {
  classifyPushError,
  classifyPushResponse,
  type PushAttemptResult,
} from "@/app/lib/notifications/push/result";
import {
  isSensitiveNotificationKind,
  notificationOpensDetail,
} from "@/app/lib/notifications/registry";
import {
  legacyParserAgrees,
  PUSH_TTL_SECONDS,
  sendPush,
} from "@/app/vendors/web-push";
import { db } from "@/db";
import {
  notifications,
  pendingUserDeletions,
  pushSubscriptions,
  users,
} from "@/db/schema";

/**
 * Why a push was not sent, stored as the delivery's `last_error`. None of these
 * is retried: each describes a state the next attempt would find too.
 */
export type PushSkipReason =
  /** Older than a push service would keep it: news no longer worth an alert. */
  | "expired"
  /** The device was removed, or now belongs to someone else. */
  | "no_device"
  | "no_notification"
  /** Archived, or rewritten unreadable by a profile-deletion scrub. */
  | "archived"
  /** Already opened in the app: an alert now would be old news. */
  | "read"
  /** An Administración copy for someone who is no longer an admin. */
  | "not_visible"
  /** The person's profile is being deleted. */
  | "deleting"
  /** The flags no longer let this person receive avisos. */
  | "push_off";

/**
 * Why this server handed a push back untried, for one that can send it:
 * no VAPID keys here, or not the keys the device subscribed with (another
 * environment pointed at this database). The attempt is not counted.
 */
export type PushReleaseReason = "unconfigured" | "key_mismatch";

export type PushDeliveryResult =
  | { kind: "skip"; reason: PushSkipReason }
  | { kind: "release"; reason: PushReleaseReason }
  | PushAttemptResult;

/** How long a flag change may take to reach avisos already queued. */
const FLAG_RULES_TTL_MS = 30_000;
let flagRules: {
  at: number;
  rules: Promise<[FeatureFlagRule, FeatureFlagRule]>;
} | null = null;

/**
 * Both rules, read at most every 30 seconds: a drain of a 100-person gift
 * would otherwise read the two flags 100 times.
 */
function pushFlagRules() {
  const now = Date.now();
  if (!flagRules || now - flagRules.at > FLAG_RULES_TTL_MS) {
    const rules = Promise.all([
      fetchFeatureFlagRule("notifications"),
      fetchFeatureFlagRule("push_notifications"),
    ]);
    flagRules = { at: now, rules };
    rules.catch(() => {
      if (flagRules?.rules === rules) flagRules = null;
    });
  }
  return flagRules.rules;
}

/** Avisos need both flags: tapping one opens the inbox item. */
async function pushVisibleTo(viewer: FeatureFlagViewer) {
  const [inbox, push] = await pushFlagRules();
  return isFeatureVisible(inbox, viewer) && isFeatureVisible(push, viewer);
}

/** Bookkeeping after a send must never turn a delivered push into a retry. */
async function bestEffort(label: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    console.error(`Push bookkeeping failed: ${label}`, {
      errorType: error instanceof Error ? error.name : typeof error,
    });
  }
}

/**
 * Sends one push delivery to its device, built from the inbox item as it is
 * now. The caller has claimed the row and settles it from the result.
 *
 * The recipient's flags are checked here, with their own role, rather than
 * when the row was written: turning the flag off stops avisos on the next
 * send, even to devices that already allowed them.
 */
export async function attemptPushDelivery(delivery: {
  notificationId: number | null;
  pushSubscriptionId: number | null;
  createdAt: Date;
}): Promise<PushDeliveryResult> {
  if (delivery.notificationId == null) {
    return { kind: "skip", reason: "no_notification" };
  }
  if (delivery.pushSubscriptionId == null) {
    return { kind: "skip", reason: "no_device" };
  }
  // A late send (throttled, or handed back) keeps only what is left of the
  // push's lifetime, so an offline device never gets it past that.
  const ttlSeconds =
    PUSH_TTL_SECONDS - (Date.now() - delivery.createdAt.getTime()) / 1000;
  if (ttlSeconds <= 0) return { kind: "skip", reason: "expired" };
  const vapid = pushVapidConfig();
  if (!vapid) return { kind: "release", reason: "unconfigured" };

  const [row] = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      kind: notifications.kind,
      category: notifications.category,
      data: notifications.data,
      title: notifications.title,
      body: notifications.body,
      readAt: notifications.readAt,
      archivedAt: notifications.archivedAt,
      role: users.role,
      deviceUserId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      applicationServerKey: pushSubscriptions.applicationServerKey,
      deleting: sql<boolean>`EXISTS (
        SELECT 1 FROM ${pendingUserDeletions}
        WHERE ${pendingUserDeletions.userId} = ${notifications.userId}
          AND ${pendingUserDeletions.localDeletedAt} IS NULL
      )`,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .leftJoin(
      pushSubscriptions,
      eq(pushSubscriptions.id, delivery.pushSubscriptionId),
    )
    .where(eq(notifications.id, delivery.notificationId))
    .limit(1);

  if (!row) return { kind: "skip", reason: "no_notification" };
  if (
    row.endpoint == null ||
    row.p256dh == null ||
    row.auth == null ||
    row.deviceUserId !== row.userId
  ) {
    return { kind: "skip", reason: "no_device" };
  }
  if (row.applicationServerKey !== vapid.publicKey) {
    return { kind: "release", reason: "key_mismatch" };
  }
  if (row.deleting) return { kind: "skip", reason: "deleting" };
  if (row.archivedAt) return { kind: "skip", reason: "archived" };
  if (row.readAt) return { kind: "skip", reason: "read" };
  // The inbox hides these from anyone no longer an admin; the tap would 404.
  if (row.category === "admin" && !canSeeAdminNotifications(row.role)) {
    return { kind: "skip", reason: "not_visible" };
  }
  if (!(await pushVisibleTo({ id: row.userId, role: row.role }))) {
    return { kind: "skip", reason: "push_off" };
  }

  const deviceId = delivery.pushSubscriptionId;
  // Checked when the device was saved; checked again so a row written by
  // anything else can never point the server at another host. Such a row
  // would fail the same way every time, so it goes.
  if (
    !isAllowedPushEndpoint(row.endpoint) ||
    !legacyParserAgrees(row.endpoint)
  ) {
    await bestEffort("remove rejected endpoint", () =>
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, deviceId)),
    );
    return { kind: "failed", error: "endpoint_rejected" };
  }

  const payload = buildPushPayload({
    id: row.id,
    title: row.title,
    body: row.body,
    sensitive: isSensitiveNotificationKind(row.kind),
    writtenText: notificationOpensDetail(row.kind, row.data),
  });

  let result: PushAttemptResult;
  try {
    const response = await sendPush(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      payload,
      { vapid, topic: pushTopic(row.id), ttlSeconds },
    );
    result = classifyPushResponse(response);
  } catch (error) {
    result = classifyPushError(error);
  }

  if (result.kind === "sent") {
    await bestEffort("mark device used", () =>
      db
        .update(pushSubscriptions)
        .set({ lastUsedAt: sql`now()` })
        .where(eq(pushSubscriptions.id, deviceId)),
    );
  } else if (result.kind === "gone") {
    // The same keys only: a browser that subscribed again in the meantime
    // saved new ones, and that device works.
    const auth = row.auth;
    await bestEffort("remove gone device", () =>
      db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.id, deviceId),
            eq(pushSubscriptions.auth, auth),
          ),
        ),
    );
  } else if (result.kind === "failed") {
    console.error("Push rejected", {
      error: result.error,
      host: pushEndpointHost(row.endpoint),
    });
  }
  return result;
}
