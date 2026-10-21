import {
  BellIcon,
  CalendarCheckIcon,
  GiftIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
  UserIcon,
  WalletIcon,
} from "lucide-react";

import type { NotificationCategory } from "@/app/lib/notifications/definitions";
import { cn } from "@/lib/utils";

const CATEGORY_STYLES: Record<
  NotificationCategory,
  { icon: typeof BellIcon; className: string }
> = {
  reservations: {
    icon: CalendarCheckIcon,
    className:
      "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  },
  credits: { icon: WalletIcon, className: "bg-primary/10 text-primary" },
  announcements: {
    icon: MegaphoneIcon,
    className:
      "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  },
  account: {
    icon: UserIcon,
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  },
  admin: {
    icon: ShieldCheckIcon,
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
};

/**
 * A category tile instead of an avatar: every item comes from the team, so a
 * face would say nothing, while the tile says what it is about.
 */
export default function NotificationIcon({
  kind,
  category,
  size = "md",
}: {
  kind: string;
  category: NotificationCategory;
  size?: "sm" | "md";
}) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.account;
  const Icon = kind === "credit_gift_received" ? GiftIcon : style.icon;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-lg",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        style.className,
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]"} />
    </span>
  );
}
