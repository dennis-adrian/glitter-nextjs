import { notFound } from "next/navigation";

import Title from "@/app/components/atoms/heading";
import NotificationInbox from "@/app/components/notifications/notification-inbox";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import {
  parseNotificationFilter,
  visibleNotificationFilters,
} from "@/app/lib/notifications/definitions";
import {
  fetchInboxPage,
  resolveInboxViewer,
} from "@/app/lib/notifications/queries";

export default async function MyNotificationsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveInboxViewer();
  if (!viewer) notFound();
  await requireFeatureEnabled("notifications", viewer);

  const filter = parseNotificationFilter(
    (await props.searchParams).filter,
    viewer.role,
  );
  const page = await fetchInboxPage(viewer, { filter });

  return (
    <div className="container max-w-2xl p-3 md:p-6">
      <div className="mb-4">
        <Title>Notificaciones</Title>
      </div>
      {/* Keyed by filter: a new filter is a new list, not a merge. */}
      <NotificationInbox
        key={filter}
        initialPage={page}
        filter={filter}
        filters={visibleNotificationFilters(viewer.role)}
      />
    </div>
  );
}
