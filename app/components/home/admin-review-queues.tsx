import Link from "next/link";

import { CheckIcon, ChevronRightIcon, type LucideIcon } from "lucide-react";

import { HubPanel, HubSection } from "@/app/components/participations/hub/hub-section";
import { cn } from "@/app/lib/utils";

export type ReviewQueue = {
  key: string;
  label: string;
  /** What the queue holds, in a few words. */
  detail: string;
  count: number;
  href: string;
  icon: LucideIcon;
};

/**
 * What waits for the team, queue by queue, each with its count and the page
 * that works it. Empty queues stay listed with a zero, so the list reads the
 * same every day; with nothing anywhere, it says so.
 */
export default function AdminReviewQueues({
  queues,
}: {
  queues: ReviewQueue[];
}) {
  const nothing = queues.every((queue) => queue.count === 0);

  return (
    <HubSection title="Por revisar">
      <HubPanel className="px-4 py-1">
        <ul>
          {queues.map((queue) => {
            const Icon = queue.icon;
            return (
              <li
                key={queue.key}
                className="border-b border-brand-border last:border-b-0"
              >
                <Link
                  href={queue.href}
                  className="flex min-h-14 items-center gap-3 py-2 hover:text-brand-primary"
                >
                  <Icon
                    className="size-5 shrink-0 text-brand-ink"
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold text-brand-ink">
                      {queue.label}
                    </span>
                    <span className="text-xs text-brand-neutral">
                      {queue.detail}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold",
                      queue.count > 0
                        ? "bg-brand-primary text-white dark:bg-primary"
                        : "bg-brand-lavender/60 text-brand-neutral",
                    )}
                  >
                    {queue.count.toLocaleString("es-BO")}
                    <span className="sr-only">
                      {queue.count === 1 ? " pendiente" : " pendientes"}
                    </span>
                  </span>
                  <ChevronRightIcon
                    className="size-4 shrink-0 text-brand-neutral"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
        {nothing ? (
          <p className="flex items-center gap-2 border-t border-brand-border py-3 text-sm text-brand-ink">
            <CheckIcon className="size-4 text-emerald-600" aria-hidden="true" />
            Nada por revisar
          </p>
        ) : null}
      </HubPanel>
    </HubSection>
  );
}
