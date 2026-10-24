import { NextResponse } from "next/server";
import { z } from "zod";

import {
  MAX_SERIAL_ID,
  notificationTapHref,
} from "@/app/lib/notifications/definitions";
import { OPENED_NOTIFICATION_COOKIE } from "@/app/lib/notifications/push/taps";
import {
  fetchNotificationForViewer,
  resolveInboxViewerWithAccess,
} from "@/app/lib/notifications/queries";
import { markNotificationRead } from "@/app/lib/notifications/read";
import { isSensitiveNotificationKind } from "@/app/lib/notifications/registry";

const idSchema = z.coerce.number().int().positive().max(MAX_SERIAL_ID);

function goTo(request: Request, path: string, openedId?: number) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  if (openedId != null) {
    // Read by the page, which then knows this tap is done and does not
    // open it a second time.
    response.cookies.set(OPENED_NOTIFICATION_COOKIE, String(openedId), {
      maxAge: 120,
      path: "/",
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
    });
  }
  return response;
}

/**
 * Where tapping a notification on the device leads: the item is marked read
 * and the person lands where tapping it in the inbox would take them (a
 * reservation update to its reservation, or its own page when it carries
 * text someone wrote, as every gift does); a disciplinary notice opens its
 * own page (`notificationTapHref`). For a device that opens Glitter on this
 * link: a cold start, or a new window. An app already open goes straight to
 * the push's `href` instead, without reloading.
 *
 * A signed-out visitor never gets here: the proxy sends them to sign in and
 * back.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ notificationId: string }> },
) {
  const parsed = idSchema.safeParse((await props.params).notificationId);
  if (!parsed.success) return goTo(request, "/my_notifications");
  const id = parsed.data;

  const viewer = await resolveInboxViewerWithAccess();
  // No profile yet, or the inbox is not open to them: the item's own page
  // says what it says to anyone else in that case.
  if (!viewer) return goTo(request, `/my_notifications/${id}`, id);

  const notification = await fetchNotificationForViewer(viewer, id);
  if (!notification) return goTo(request, "/my_notifications", id);

  if (notification.readAt == null) {
    // Never holds the person up: the item's page marks it read too.
    await markNotificationRead(viewer, notification.id).catch(() => undefined);
  }
  return goTo(
    request,
    notificationTapHref(
      notification,
      isSensitiveNotificationKind(notification.kind),
    ),
    id,
  );
}
