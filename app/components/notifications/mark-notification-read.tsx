"use client";

import { useEffect, useRef } from "react";

import { announceNotificationsChanged } from "@/app/components/notifications/notification-events";
import { markNotificationReadAction } from "@/app/lib/notifications/actions";

/**
 * Opening an item reads it. A client effect rather than a write during the
 * server render, so a prefetch of the page never marks anything read. The
 * bell hears about it once the write lands, not a minute later.
 */
export default function MarkNotificationRead({
  id,
  unread,
}: {
  id: number;
  unread: boolean;
}) {
  const done = useRef(false);
  useEffect(() => {
    if (!unread || done.current) return;
    done.current = true;
    void markNotificationReadAction(id)
      .then(() => announceNotificationsChanged())
      .catch(() => undefined);
  }, [id, unread]);
  return null;
}
