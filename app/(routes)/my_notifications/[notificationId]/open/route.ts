import { redirect } from "next/navigation";
import { z } from "zod";

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

/**
 * Where tapping a notification on the device leads: the item is marked read
 * and the person lands where tapping it in the inbox would take them (a gift
 * to the wallet, or to its own page when it carries a message). Done here
 * rather than in the page, so it works however the device opens Glitter: a
 * cold start, a resumed app, or a tab it navigates.
 *
 * A signed-out visitor never gets here: the proxy sends them to sign in and
 * back.
 */
export async function GET(
  _request: Request,
  props: { params: Promise<{ notificationId: string }> },
) {
  const parsed = idSchema.safeParse((await props.params).notificationId);
  if (!parsed.success) redirect("/my_notifications");
  const detail = `/my_notifications/${parsed.data}`;

  const viewer = await resolveInboxViewerWithAccess();
  // No profile yet, or the inbox is not open to them: the item's own page
  // says what it says to anyone else in that case.
  if (!viewer) redirect(detail);

  const notification = await fetchNotificationForViewer(viewer, parsed.data);
  if (!notification) redirect("/my_notifications");

  if (notification.readAt == null) {
    // Never holds the person up: the item's page marks it read too.
    await markNotificationReadAction(notification.id).catch(() => undefined);
  }
  redirect(notificationHref(notification));
}
