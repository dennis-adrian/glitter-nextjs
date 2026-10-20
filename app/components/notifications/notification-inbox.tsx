"use client";

import { BellIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { announceNotificationsChanged } from "@/app/components/notifications/notification-events";
import NotificationFilterChips from "@/app/components/notifications/notification-filter-chips";
import NotificationItem from "@/app/components/notifications/notification-item";
import NotificationItemMenu from "@/app/components/notifications/notification-item-menu";
import { useMarkAllNotificationsRead } from "@/app/components/notifications/use-mark-all-notifications-read";
import { Button } from "@/app/components/ui/button";
import { markNotificationReadAction } from "@/app/lib/notifications/actions";
import {
  type InboxNotification,
  type InboxPage,
  NOTIFICATION_DATE_GROUP_LABELS,
  type NotificationDateGroup,
  notificationDateGroup,
  type NotificationFilter,
  NOTIFICATION_PAGE_SIZE,
} from "@/app/lib/notifications/definitions";

async function fetchInboxFirstPage(
  filter: NotificationFilter,
): Promise<InboxPage | null> {
  try {
    const params = new URLSearchParams({
      limit: String(NOTIFICATION_PAGE_SIZE),
    });
    if (filter !== "all") params.set("filter", filter);
    const response = await fetch(`/api/notifications?${params}`, {
      cache: "no-store",
    });
    return response.ok ? ((await response.json()) as InboxPage) : null;
  } catch {
    return null;
  }
}

type NotificationInboxProps = {
  initialPage: InboxPage;
  filter: NotificationFilter;
  filters: NotificationFilter[];
};

function groupItems(items: InboxNotification[]) {
  const groups: { group: NotificationDateGroup; items: InboxNotification[] }[] =
    [];
  for (const item of items) {
    const group = notificationDateGroup(new Date(item.createdAt));
    const last = groups.at(-1);
    if (last?.group === group) last.items.push(item);
    else groups.push({ group, items: [item] });
  }
  return groups;
}

/**
 * The full inbox: filters, items grouped by day, and "Ver más". Also where
 * phones land from the bell and where emails will link to.
 */
export default function NotificationInbox({
  initialPage,
  filter,
  filters,
}: NotificationInboxProps) {
  const [items, setItems] = useState(initialPage.items);
  const [unreadCount, setUnreadCount] = useState(initialPage.unreadCount);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, startLoading] = useTransition();

  // The router can hand back this page's payload from its cache, on "back"
  // after opening an item for example, so the first page is asked for again
  // once mounted rather than trusting what the server rendered earlier.
  useEffect(() => {
    let current = true;
    void fetchInboxFirstPage(filter).then((page) => {
      if (!current || !page) return;
      setItems(page.items);
      setUnreadCount(page.unreadCount);
      setCursor(page.nextCursor);
    });
    return () => {
      current = false;
    };
  }, [filter]);

  function open(item: InboxNotification) {
    if (item.readAt != null) return;
    replace({ ...item, readAt: new Date().toISOString() });
    void markNotificationReadAction(item.id)
      .then(() => announceNotificationsChanged())
      .catch(() => undefined);
  }

  const { markAll, isPending } = useMarkAllNotificationsRead({
    onRead: (ids) => {
      const read = new Set(ids);
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((item) =>
          read.has(item.id) ? { ...item, readAt: now } : item,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - ids.length));
    },
    onUndo: (ids) => {
      const restored = new Set(ids);
      setItems((current) =>
        current.map((item) =>
          restored.has(item.id) ? { ...item, readAt: null } : item,
        ),
      );
      setUnreadCount((count) => count + ids.length);
    },
  });

  function replace(next: InboxNotification) {
    const previous = items.find((item) => item.id === next.id);
    if (previous && (previous.readAt == null) !== (next.readAt == null)) {
      setUnreadCount((count) =>
        Math.max(0, count + (next.readAt == null ? 1 : -1)),
      );
    }
    setItems((current) =>
      current.map((item) => (item.id === next.id ? next : item)),
    );
  }

  function loadMore() {
    if (!cursor) return;
    startLoading(async () => {
      setLoadFailed(false);
      try {
        const params = new URLSearchParams({ before: cursor, limit: "20" });
        if (filter !== "all") params.set("filter", filter);
        const response = await fetch(`/api/notifications?${params}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("notifications_failed");
        const page = (await response.json()) as InboxPage;
        setItems((current) => [
          ...current,
          ...page.items.filter(
            (item) => !current.some((existing) => existing.id === item.id),
          ),
        ]);
        setCursor(page.nextCursor);
      } catch {
        setLoadFailed(true);
      }
    });
  }

  const groups = groupItems(items);

  return (
    <div className="space-y-4">
      <NotificationFilterChips filters={filters} active={filter} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {unreadCount === 1 ? "1 sin leer" : `${unreadCount} sin leer`}
        </p>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          disabled={unreadCount === 0 || isPending}
          onClick={() => markAll(filter)}
        >
          Marcar todo como leído
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center text-muted-foreground">
          <BellIcon className="h-10 w-10" aria-hidden />
          <p className="max-w-sm text-sm">
            {filter === "all"
              ? "Todavía no tenés notificaciones. Acá vas a ver novedades de tus reservas, pagos y créditos."
              : "No tenés notificaciones de este tipo."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ group, items: groupItemsList }) => (
            <section
              key={group}
              aria-label={NOTIFICATION_DATE_GROUP_LABELS[group]}
            >
              <h2 className="mb-1 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {NOTIFICATION_DATE_GROUP_LABELS[group]}
              </h2>
              <div className="overflow-hidden rounded-lg border bg-background">
                {groupItemsList.map((item) => (
                  <NotificationItem
                    key={item.id}
                    item={item}
                    onOpen={open}
                    menu={
                      <NotificationItemMenu
                        item={item}
                        onChange={replace}
                        onArchive={(archived) => {
                          setItems((current) =>
                            current.filter((row) => row.id !== archived.id),
                          );
                          if (archived.readAt == null) {
                            setUnreadCount((count) => Math.max(0, count - 1));
                          }
                        }}
                        onRestore={(restored) => {
                          setItems((current) =>
                            current.some((row) => row.id === restored.id)
                              ? current
                              : [...current, restored].sort((a, b) =>
                                  b.createdAt.localeCompare(a.createdAt),
                                ),
                          );
                          if (restored.readAt == null) {
                            setUnreadCount((count) => count + 1);
                          }
                        }}
                      />
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {cursor && (
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={loadMore}
            disabled={isLoading}
          >
            {isLoading ? "Cargando…" : "Ver más"}
          </Button>
          {loadFailed && (
            <p className="text-sm text-muted-foreground">
              No pudimos cargar más. Intentá de nuevo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
