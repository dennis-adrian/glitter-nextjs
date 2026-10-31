"use client";

import { BellIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  announceNotificationsChanged,
  onNotificationsChanged,
} from "@/app/components/notifications/notification-events";
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

/**
 * The first page asked for again, merged into the list on screen: its items
 * replace theirs and go on top, and older ones that "Ver más" loaded stay
 * below. Ids only grow, so anything below the page's last id is older; an
 * item gone from the page's range was archived or read away elsewhere. A
 * page with no cursor holds everything there is, so nothing older stays.
 */
export function mergeFirstPage(
  current: readonly InboxNotification[],
  page: InboxPage,
): { items: InboxNotification[]; keepsCursor: boolean } {
  if (page.nextCursor == null) return { items: page.items, keepsCursor: false };
  const last = page.items.at(-1);
  const older = last ? current.filter((item) => item.id < last.id) : [];
  return { items: [...page.items, ...older], keepsCursor: older.length > 0 };
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
  // Bumped by every change made here to what is read or archived, so an
  // answer requested before one of them cannot overwrite it.
  const changes = useRef(0);
  // The list as it is now, for handlers that run after an await and must
  // compare with the latest list, not the one their closure saw. Every change
  // goes through `updateItems`, which keeps the ref and the state in step.
  const itemsRef = useRef(items);

  function updateItems(
    change: (current: InboxNotification[]) => InboxNotification[],
  ) {
    const next = change(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }

  // The first page is asked for again whenever it may have changed out of
  // sight: once mounted (the router can hand back a cached render, on "back"
  // after opening an item for example), when Glitter comes back to the front
  // (an installed app resumes as it was left), and when a change is
  // announced: a notification arriving while it is open, or an action here
  // saved.
  useEffect(() => {
    let current = true;
    let inFlight = false;
    let again = false;

    const refresh = (announced = false) => {
      if (document.visibilityState !== "visible") return;
      if (inFlight) {
        // A change announced mid-request may postdate the answer on its way,
        // so ask once more when it lands. Focus and visibility, which fire
        // together, are already answered by the request in flight.
        if (announced) again = true;
        return;
      }
      inFlight = true;
      const changesAtRequest = changes.current;
      void fetchInboxFirstPage(filter)
        .then((page) => {
          // A change made here meanwhile wins. Its action announces itself
          // once saved, which asks again.
          if (!current || !page || changes.current !== changesAtRequest) return;
          const merged = mergeFirstPage(itemsRef.current, page);
          updateItems(() => merged.items);
          setUnreadCount(page.unreadCount);
          if (!merged.keepsCursor) setCursor(page.nextCursor);
        })
        .finally(() => {
          inFlight = false;
          if (current && again) {
            again = false;
            refresh();
          }
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const unsubscribe = onNotificationsChanged(() => refresh(true));
    return () => {
      current = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      unsubscribe();
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
      changes.current += 1;
      const read = new Set(ids);
      const now = new Date().toISOString();
      updateItems((current) =>
        current.map((item) =>
          read.has(item.id) ? { ...item, readAt: now } : item,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - ids.length));
    },
    onUndo: (ids) => {
      changes.current += 1;
      const restored = new Set(ids);
      updateItems((current) =>
        current.map((item) =>
          restored.has(item.id) ? { ...item, readAt: null } : item,
        ),
      );
      setUnreadCount((count) => count + ids.length);
    },
  });

  function replace(next: InboxNotification) {
    changes.current += 1;
    // From the ref, not the render's `items`: a rollback after a failed
    // action runs from a closure that still holds the pre-change list, and
    // would otherwise see no change and leave the count off by one.
    const previous = itemsRef.current.find((item) => item.id === next.id);
    if (previous && (previous.readAt == null) !== (next.readAt == null)) {
      setUnreadCount((count) =>
        Math.max(0, count + (next.readAt == null ? 1 : -1)),
      );
    }
    updateItems((current) =>
      current.map((item) => (item.id === next.id ? next : item)),
    );
  }

  // Not a change a refresh could undo: it keeps what loads here below the
  // first page (mergeFirstPage).
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
        updateItems((current) => [
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
                          changes.current += 1;
                          updateItems((current) =>
                            current.filter((row) => row.id !== archived.id),
                          );
                          if (archived.readAt == null) {
                            setUnreadCount((count) => Math.max(0, count - 1));
                          }
                        }}
                        onRestore={(restored) => {
                          changes.current += 1;
                          updateItems((current) =>
                            current.some((row) => row.id === restored.id)
                              ? current
                              : [...current, restored].sort(
                                  (a, b) => b.id - a.id,
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
