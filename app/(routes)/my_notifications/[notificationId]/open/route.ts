import { NextResponse } from "next/server";
import { z } from "zod";

import { OPENED_NOTIFICATION_COOKIE } from "@/app/lib/notifications/push/taps";
import { markNotificationReadAction } from "@/app/lib/notifications/actions";
import {
  MAX_SERIAL_ID,
  notificationHref,
} from "@/app/lib/notifications/definitions";
import {
  fetchNotificationForViewer,
  resolveInboxViewerWithAccess,
} from "@/app/lib/notifications/queries";

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
 * and the person lands where tapping it in the inbox would take them (a gift
 * to the wallet, or its own page when it carries a message). Done here
 * rather than in the page, so it works however the device opens Glitter: a
 * cold start, a resumed app, or a tab it navigates.
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
    await markNotificationReadAction(notification.id).catch(() => undefined);
  }
  return goTo(request, notificationHref(notification), id);
}
