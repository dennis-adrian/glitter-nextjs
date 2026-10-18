"use client";

import { useEffect, useRef } from "react";

import { markNotificationReadAction } from "@/app/lib/notifications/actions";

/**
 * Opening an item reads it. A client effect rather than a write during the
 * server render, so a prefetch of the page never marks anything read.
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
    void markNotificationReadAction(id);
  }, [id, unread]);
  return null;
}
