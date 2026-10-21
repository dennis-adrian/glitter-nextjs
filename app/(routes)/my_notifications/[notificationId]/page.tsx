import Link from "next/link";
import { notFound } from "next/navigation";
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
  await requireFeatureEnabled("notifications", viewer);

  const parsed = idSchema.safeParse((await props.params).notificationId);
  if (!parsed.success) notFound();
  const notification = await fetchNotificationForViewer(viewer, parsed.data);
  if (!notification) notFound();

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
