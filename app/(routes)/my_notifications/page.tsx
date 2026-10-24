import { DateTime } from "luxon";
import { notFound } from "next/navigation";

import Title from "@/app/components/atoms/heading";
import NotificationInbox from "@/app/components/notifications/notification-inbox";
import { PushControl } from "@/app/components/notifications/push-control";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { formatDisplayDate } from "@/app/lib/formatters";
import { isPushEnabledFor } from "@/app/lib/notifications/push/access";
import { pushPublicKey } from "@/app/lib/notifications/push/config";
import { fetchPushDevices } from "@/app/lib/notifications/push/devices";
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

  const filter = parseNotificationFilter(
    (await props.searchParams).filter,
    viewer.role,
  );
  // Asked together, each its own trip to the database; the flag check still
  // turns the page away when it is off.
  const [, page, pushEnabled, devices] = await Promise.all([
    requireFeatureEnabled("notifications", viewer),
    fetchInboxPage(viewer, { filter }),
    isPushEnabledFor(viewer),
    fetchPushDevices(viewer.id),
  ]);

  return (
    <div className="container max-w-2xl p-3 md:p-6">
      <div className="mb-4">
        <Title>Notificaciones</Title>
      </div>
      {/* Outside the keyed inbox, so changing filter keeps its state. */}
      {pushEnabled && (
        <div className="mb-4">
          <PushControl
            publicKey={pushPublicKey()}
            devices={devices.map((device) => ({
              id: device.id,
              label: device.label,
              lastUsedLabel: formatDisplayDate(
                device.lastUsedAt,
                DateTime.DATE_MED,
              ),
            }))}
          />
        </div>
      )}
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
