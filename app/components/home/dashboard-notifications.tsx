"use client";

import { useState } from "react";

import { announceNotificationsChanged } from "@/app/components/notifications/notification-events";
import NotificationItem from "@/app/components/notifications/notification-item";
import { HubPanel } from "@/app/components/participations/hub/hub-section";
import { markNotificationReadAction } from "@/app/lib/notifications/actions";
import type { InboxNotification } from "@/app/lib/notifications/definitions";

/**
 * The latest few inbox items. Opening one reads it, the way the bell's
 * popover does, and tells the bell so its count follows.
 */
export default function DashboardNotifications({
  items: initialItems,
}: {
  items: InboxNotification[];
}) {
  const [items, setItems] = useState(initialItems);

  function open(item: InboxNotification) {
    if (item.readAt != null) return;
    const now = new Date().toISOString();
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, readAt: now } : entry,
      ),
    );
    void markNotificationReadAction(item.id)
      .then(() => announceNotificationsChanged())
      .catch(() => undefined);
  }

  if (items.length === 0) {
    return (
      <HubPanel>
        <p className="text-sm text-brand-neutral">
          No tenés notificaciones recientes.
        </p>
      </HubPanel>
    );
  }

  return (
    <HubPanel className="overflow-hidden p-0">
      {items.map((item) => (
        <NotificationItem key={item.id} item={item} compact onOpen={open} />
      ))}
    </HubPanel>
  );
}
