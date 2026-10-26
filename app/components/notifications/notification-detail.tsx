import Link from "next/link";

import RichTextHtml from "@/app/components/molecules/rich-text-html";
import NotificationIcon from "@/app/components/notifications/notification-icon";
import { Button } from "@/app/components/ui/button";
import { formatDateWithTime, formatDisplayDate } from "@/app/lib/formatters";
import { NOTIFICATION_CATEGORY_LABELS } from "@/app/lib/notifications/definitions";
import { formatCreditDelta } from "@/app/lib/notifications/format";
import type { NotificationDetail as NotificationDetailData } from "@/app/lib/notifications/queries";

/** One item in full, with its one action. */
export default function NotificationDetail({
  notification,
}: {
  notification: NotificationDetailData;
}) {
  const text = notification.message ?? notification.body;

  return (
    <article className="space-y-4 rounded-lg border bg-background p-4 md:p-6">
      <header className="flex items-start gap-3">
        <NotificationIcon
          kind={notification.kind}
          category={notification.category}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {NOTIFICATION_CATEGORY_LABELS[notification.category]} ·{" "}
            {formatDateWithTime(new Date(notification.createdAt))}
          </p>
          <h1 className="font-display text-xl font-bold leading-tight">
            {notification.title}
          </h1>
          {notification.editedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Editado el{" "}
              {formatDisplayDate(notification.editedAt, {
                day: "numeric",
                month: "long",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
        {notification.creditDelta != null && (
          <span
            className={
              notification.creditDelta > 0
                ? "shrink-0 text-lg font-bold tabular-nums text-green-700 dark:text-green-400"
                : "shrink-0 text-lg font-bold tabular-nums"
            }
          >
            {formatCreditDelta(notification.creditDelta)}
          </span>
        )}
      </header>

      {/* A comunicado reads as written; anything else, as plain text. */}
      {notification.bodyHtml?.trim() ? (
        <RichTextHtml html={notification.bodyHtml} className="text-base" />
      ) : (
        <p className="whitespace-pre-line leading-relaxed">{text}</p>
      )}

      {notification.actionPath && notification.actionLabel && (
        <Button asChild>
          <Link href={notification.actionPath}>{notification.actionLabel}</Link>
        </Button>
      )}
    </article>
  );
}
