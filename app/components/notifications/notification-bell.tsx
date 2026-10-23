"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import NotificationPopoverContent, {
  NOTIFICATION_POPOVER_HEADING_ID,
} from "@/app/components/notifications/notification-popover-content";
import { useUnreadNotificationCount } from "@/app/components/notifications/use-unread-notification-count";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { cn } from "@/lib/utils";

function badgeLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

function accessibleLabel(count: number | null) {
  if (!count) return "Notificaciones";
  return count === 1
    ? "Notificaciones, 1 sin leer"
    : `Notificaciones, ${count} sin leer`;
}

const triggerClassName =
  "relative grid h-9 w-9 place-items-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Holds the bell's place while the profile loads, so the navbar does not
 * shift, without asking for an unread count nobody may have yet.
 */
export function NotificationBellPlaceholder() {
  return (
    <span
      aria-hidden
      data-testid="notification-bell-placeholder"
      className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground"
    >
      <BellIcon className="h-5 w-5" />
    </span>
  );
}

/**
 * The bell: a popover on desktop, the full page on phones, where a popover
 * has no room and the back button should work.
 */
export default function NotificationBell({
  pushPublicKey = null,
}: {
  /** Offers avisos in the popover; phones get the offer on the page. */
  pushPublicKey?: string | null;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { count, setCount } = useUnreadNotificationCount();
  const [open, setOpen] = useState(false);

  const badge =
    count != null && count > 0 ? (
      <span
        aria-hidden
        className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-brand-elevated bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground"
      >
        {badgeLabel(count)}
      </span>
    ) : null;

  if (!isDesktop) {
    return (
      <Link
        href="/my_notifications"
        aria-label={accessibleLabel(count)}
        className={triggerClassName}
      >
        <BellIcon className="h-5 w-5" aria-hidden />
        {badge}
      </Link>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={accessibleLabel(count)}
        className={cn(triggerClassName, open && "bg-muted")}
      >
        <BellIcon className="h-5 w-5" aria-hidden />
        {badge}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[400px] p-0"
        aria-labelledby={NOTIFICATION_POPOVER_HEADING_ID}
      >
        {open && (
          <NotificationPopoverContent
            knownCount={count}
            onCountChange={setCount}
            onNavigate={() => setOpen(false)}
            pushPublicKey={pushPublicKey}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
