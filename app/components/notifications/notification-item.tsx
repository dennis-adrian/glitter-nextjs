"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import NotificationIcon from "@/app/components/notifications/notification-icon";
import {
  type InboxNotification,
  notificationHref,
} from "@/app/lib/notifications/definitions";
import {
  formatCreditDelta,
  formatNotificationTime,
} from "@/app/lib/notifications/format";
import { cn } from "@/lib/utils";

type NotificationItemProps = {
  item: InboxNotification;
  /** Called before following the link, to mark the item read. */
  onOpen?: (item: InboxNotification) => void;
  /** A per-item menu, rendered outside the link. */
  menu?: ReactNode;
  /** Render without a link, for previews. */
  static?: boolean;
  compact?: boolean;
};

/**
 * One inbox row: category tile, title, two lines of body, time, unread dot,
 * and the credits it moved. Clicking anywhere opens the item; its detail page
 * carries the one action.
 */
export default function NotificationItem({
  item,
  onOpen,
  menu,
  static: isStatic = false,
  compact = false,
}: NotificationItemProps) {
  const unread = item.readAt == null;
  const content = (
    <>
      <NotificationIcon
        kind={item.kind}
        category={item.category}
        size={compact ? "sm" : "md"}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug",
            unread ? "font-semibold" : "font-medium",
          )}
        >
          {item.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
          {item.body}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-muted-foreground">
        <time dateTime={item.createdAt} suppressHydrationWarning>
          {formatNotificationTime(item.createdAt)}
        </time>
        {item.creditDelta != null && (
          <span
            className={cn(
              "font-semibold tabular-nums",
              item.creditDelta > 0 ? "text-green-700" : "text-foreground",
            )}
          >
            {formatCreditDelta(item.creditDelta)}
          </span>
        )}
        {unread && (
          <span className="h-2 w-2 rounded-full bg-primary">
            <span className="sr-only">No leída</span>
          </span>
        )}
      </div>
    </>
  );

  const rowClassName = cn(
    "flex min-w-0 flex-1 items-start gap-3 text-left",
    compact ? "px-3 py-2.5" : "px-4 py-3",
  );

  return (
    <div
      className={cn(
        "flex items-start border-b last:border-b-0",
        unread && "bg-primary/[0.04]",
      )}
    >
      {isStatic ? (
        <div className={rowClassName}>{content}</div>
      ) : (
        <Link
          href={notificationHref(item)}
          onClick={() => onOpen?.(item)}
          className={cn(
            rowClassName,
            "transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
          )}
        >
          {content}
        </Link>
      )}
      {menu && <div className="shrink-0 py-2 pr-2">{menu}</div>}
    </div>
  );
}
