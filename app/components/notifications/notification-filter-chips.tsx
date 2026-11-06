import Link from "next/link";

import {
  NOTIFICATION_FILTER_LABELS,
  type NotificationFilter,
} from "@/app/lib/notifications/definitions";
import { cn } from "@/lib/utils";

/** Category filters as links, so a filtered inbox is a URL you can come back to. */
export default function NotificationFilterChips({
  filters,
  active,
}: {
  filters: NotificationFilter[];
  active: NotificationFilter;
}) {
  return (
    <nav
      aria-label="Filtrar notificaciones"
      className="-mx-1 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max gap-2">
        {filters.map((filter) => (
          <li key={filter}>
            <Link
              href={
                filter === "all"
                  ? "/my_notifications"
                  : `/my_notifications?filter=${filter}`
              }
              aria-current={filter === active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors",
                filter === active
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {NOTIFICATION_FILTER_LABELS[filter]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
