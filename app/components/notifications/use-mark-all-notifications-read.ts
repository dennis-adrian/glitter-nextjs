"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { announceNotificationsChanged } from "@/app/components/notifications/notification-events";
import {
  markAllNotificationsReadAction,
  markNotificationsUnreadAction,
} from "@/app/lib/notifications/actions";
import type { NotificationFilter } from "@/app/lib/notifications/definitions";

/**
 * "Marcar todo como leído" with an undo that restores exactly the items it
 * read, and nothing that arrived after. Both tell the bell, which may live in
 * a popover that has already closed.
 */
export function useMarkAllNotificationsRead({
  onRead,
  onUndo,
}: {
  onRead: (ids: number[]) => void;
  onUndo: (ids: number[]) => void;
}) {
  const [isPending, startTransition] = useTransition();

  async function undo(ids: number[]) {
    try {
      const result = await markNotificationsUnreadAction(ids);
      if (!result.success) {
        toast.error(result.message ?? "No pudimos deshacerlo.");
        return;
      }
      onUndo(ids);
      announceNotificationsChanged();
    } catch {
      toast.error("No pudimos deshacerlo. Intentá de nuevo.");
    }
  }

  function markAll(filter: NotificationFilter) {
    startTransition(async () => {
      try {
        const result = await markAllNotificationsReadAction(filter);
        if (!result.success || !result.ids) {
          toast.error(result.message ?? "No pudimos marcarlas como leídas.");
          return;
        }
        const ids = result.ids;
        onRead(ids);
        announceNotificationsChanged();
        if (ids.length === 0) return;
        toast.success(
          ids.length === 1
            ? "Marcamos 1 notificación como leída."
            : `Marcamos ${ids.length} notificaciones como leídas.`,
          { action: { label: "Deshacer", onClick: () => void undo(ids) } },
        );
      } catch {
        toast.error("No pudimos marcarlas como leídas. Intentá de nuevo.");
      }
    });
  }

  return { markAll, isPending };
}
