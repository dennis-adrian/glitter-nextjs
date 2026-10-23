"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { announceNotificationsChanged } from "@/app/components/notifications/notification-events";
import NotificationItem from "@/app/components/notifications/notification-item";
import { PushOffer } from "@/app/components/notifications/push-control";
import { useMarkAllNotificationsRead } from "@/app/components/notifications/use-mark-all-notifications-read";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { markNotificationReadAction } from "@/app/lib/notifications/actions";
import {
  type InboxNotification,
  type InboxPage,
  NOTIFICATION_POPOVER_SIZE,
} from "@/app/lib/notifications/definitions";
import { cn } from "@/lib/utils";

type View = "unread" | "all";

/** Names the popover for screen readers; the bell points its dialog at it. */
export const NOTIFICATION_POPOVER_HEADING_ID = "notification-popover-heading";

/** The popover's page, or null when it could not be loaded. */
async function fetchInboxPreview(view: View): Promise<InboxPage | null> {
  try {
    const params = new URLSearchParams({
      limit: String(NOTIFICATION_POPOVER_SIZE),
    });
    if (view === "unread") params.set("unread", "1");
    const response = await fetch(`/api/notifications?${params}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as InboxPage;
  } catch {
    return null;
  }
}

type NotificationPopoverContentProps = {
  /** The bell's own count, shown until this list has answered. */
  knownCount: number | null;
  onCountChange: (count: number) => void;
  onNavigate: () => void;
  /** Offers avisos in the footer; null when they are not open. */
  pushPublicKey?: string | null;
};

/**
 * The latest items, loaded when the popover opens. "No leídas" first: that is
 * what the badge promised.
 */
export default function NotificationPopoverContent({
  knownCount,
  onCountChange,
  onNavigate,
  pushPublicKey = null,
}: NotificationPopoverContentProps) {
  const [view, setView] = useState<View>("unread");
  // Bumped to load again: "Reintentar", and an undo that changed the list.
  const [attempt, setAttempt] = useState(0);
  const key = `${view}:${attempt}`;
  // Stored with the request it answers, so switching tabs shows a skeleton
  // instead of the other tab's items.
  const [result, setResult] = useState<{
    key: string;
    page: InboxPage | null;
  } | null>(null);

  useEffect(() => {
    let current = true;
    const requestKey = `${view}:${attempt}`;
    void fetchInboxPreview(view).then((page) => {
      if (!current) return;
      setResult({ key: requestKey, page });
      if (page) onCountChange(page.unreadCount);
    });
    return () => {
      current = false;
    };
  }, [view, attempt, onCountChange]);

  const answered = result?.key === key ? result : null;
  const page = answered?.page ?? null;
  const failed = answered != null && answered.page == null;
  const retry = () => setAttempt((count) => count + 1);

  const { markAll, isPending } = useMarkAllNotificationsRead({
    onRead: (ids) => {
      const read = new Set(ids);
      const now = new Date().toISOString();
      setResult((current) =>
        current?.page
          ? {
              ...current,
              page: {
                ...current.page,
                unreadCount: 0,
                items: current.page.items.map((item) =>
                  read.has(item.id) ? { ...item, readAt: now } : item,
                ),
              },
            }
          : current,
      );
      onCountChange(0);
    },
    onUndo: retry,
  });

  function open(item: InboxNotification) {
    if (item.readAt == null) {
      onCountChange(Math.max(0, (page?.unreadCount ?? 1) - 1));
      void markNotificationReadAction(item.id)
        .then(() => announceNotificationsChanged())
        .catch(() => undefined);
    }
    onNavigate();
  }

  // While a view loads, the bell's count stands in rather than "0 sin leer";
  // it is also what an undo or another tab refreshes first. "Marcar todo"
  // waits for the list itself.
  const unreadCount = page?.unreadCount ?? knownCount ?? 0;

  return (
    <div className="flex max-h-[min(560px,80vh)] flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <h2
          id={NOTIFICATION_POPOVER_HEADING_ID}
          className="font-display text-base font-bold"
        >
          Notificaciones
        </h2>
        {/* Two toggle buttons rather than tabs: there is one list, filtered. */}
        <div
          className="inline-flex rounded-md bg-muted p-0.5 text-xs"
          role="group"
          aria-label="Qué notificaciones mostrar"
        >
          {(["unread", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                "rounded px-2.5 py-1",
                view === value
                  ? "bg-background font-semibold shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {value === "unread" ? "No leídas" : "Todas"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-b px-4 pb-2">
        <span className="text-xs text-muted-foreground">
          {unreadCount === 1 ? "1 sin leer" : `${unreadCount} sin leer`}
        </span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          disabled={!page || unreadCount === 0 || isPending}
          onClick={() => markAll("all")}
        >
          Marcar todo como leído
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {failed ? (
          <div className="space-y-2 p-4 text-sm">
            <p className="text-muted-foreground">
              No pudimos cargar tus notificaciones.
            </p>
            <Button size="sm" variant="outline" onClick={retry}>
              Reintentar
            </Button>
          </div>
        ) : !page ? (
          <div className="space-y-3 p-4" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : page.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
            <BellIcon className="h-8 w-8" aria-hidden />
            {!page.isEmptyInbox ? (
              <p>¡Estás al día!</p>
            ) : (
              <p>
                Todavía no tenés notificaciones. Acá vas a ver novedades de tus
                reservas, pagos y créditos.
              </p>
            )}
          </div>
        ) : (
          page.items.map((item) => (
            <NotificationItem key={item.id} item={item} compact onOpen={open} />
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-4 py-2.5 text-sm">
        <Link
          href="/my_notifications"
          onClick={onNavigate}
          className="font-medium text-primary hover:underline"
        >
          Ver todas
        </Link>
        <PushOffer
          publicKey={pushPublicKey}
          onNavigate={onNavigate}
          showBlocked
        />
      </div>
    </div>
  );
}
