"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  markAllNotificationsReadAction,
  markNotificationsUnreadAction,
} from "@/app/lib/notifications/actions";
import type { NotificationFilter } from "@/app/lib/notifications/definitions";

/**
 * "Marcar todo como leído" with an undo that restores exactly the items it
 * read, and nothing that arrived after.
 */
export function useMarkAllNotificationsRead({
  onRead,
  onUndo,
}: {
  onRead: (ids: number[]) => void;
  onUndo: (ids: number[]) => void;
}) {
  const [isPending, startTransition] = useTransition();

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
        if (ids.length === 0) return;
        toast.success(
          ids.length === 1
            ? "Marcamos 1 notificación como leída."
            : `Marcamos ${ids.length} notificaciones como leídas.`,
          {
            action: {
              label: "Deshacer",
              onClick: () => {
                void markNotificationsUnreadAction(ids.slice(0, 500)).then(() =>
                  onUndo(ids),
                );
              },
            },
          },
        );
      } catch {
        toast.error("No pudimos marcarlas como leídas. Intentá de nuevo.");
      }
    });
  }

  return { markAll, isPending };
}
