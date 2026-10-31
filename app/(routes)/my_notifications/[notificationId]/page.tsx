import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import MarkNotificationRead from "@/app/components/notifications/mark-notification-read";
import NotificationDetail from "@/app/components/notifications/notification-detail";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
import {
  fetchNotificationForViewer,
  resolveInboxViewer,
} from "@/app/lib/notifications/queries";

const idSchema = z.coerce.number().int().positive().max(MAX_SERIAL_ID);

export default async function NotificationPage(props: {
  params: Promise<{ notificationId: string }>;
}) {
  const viewer = await resolveInboxViewer();
  if (!viewer) notFound();
  const parsed = idSchema.safeParse((await props.params).notificationId);
  if (!parsed.success) notFound();

  // Asked together; the flag check still turns the page away when it is off.
  const [, notification] = await Promise.all([
    requireFeatureEnabled("notifications", viewer),
    fetchNotificationForViewer(viewer, parsed.data),
  ]);
  // Archived or gone since (a tap on an old push lands here): the inbox, as
  // the open route does.
  if (!notification) redirect("/my_notifications");

  return (
    <div className="container max-w-2xl space-y-3 p-3 md:p-6">
      <Link
        href="/my_notifications"
        className="text-sm text-muted-foreground hover:underline"
      >
        Volver a las notificaciones
      </Link>
      <NotificationDetail notification={notification} />
      <MarkNotificationRead
        id={notification.id}
        unread={notification.readAt == null}
      />
    </div>
  );
}
