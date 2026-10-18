"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import {
  archiveNotificationAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
  unarchiveNotificationAction,
} from "@/app/lib/notifications/actions";
import type { InboxNotification } from "@/app/lib/notifications/definitions";

type NotificationItemMenuProps = {
  item: InboxNotification;
  onChange: (item: InboxNotification) => void;
  onArchive: (item: InboxNotification) => void;
  onRestore: (item: InboxNotification) => void;
};

/**
 * Read state and archive. No delete: a notice about a payment or a sanction
 * stays on record, so support can still see what the person was told.
 */
export default function NotificationItemMenu({
  item,
  onChange,
  onArchive,
  onRestore,
}: NotificationItemMenuProps) {
  const unread = item.readAt == null;

  async function toggleRead() {
    const next = {
      ...item,
      readAt: unread ? new Date().toISOString() : null,
    };
    onChange(next);
    const result = unread
      ? await markNotificationReadAction(item.id)
      : await markNotificationUnreadAction(item.id);
    if (!result.success) {
      onChange(item);
      toast.error("No pudimos actualizar la notificación.");
    }
  }

  async function archive() {
    onArchive(item);
    const result = await archiveNotificationAction(item.id);
    if (!result.success) {
      onRestore(item);
      toast.error("No pudimos archivar la notificación.");
      return;
    }
    toast.success("Notificación archivada.", {
      action: {
        label: "Deshacer",
        onClick: () => {
          void unarchiveNotificationAction(item.id).then((undo) => {
            if (undo.success) onRestore(item);
          });
        },
      },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Opciones de «${item.title}»`}
        >
          <MoreHorizontalIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void toggleRead()}>
          {unread ? "Marcar como leída" : "Marcar como no leída"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void archive()}>
          Archivar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
