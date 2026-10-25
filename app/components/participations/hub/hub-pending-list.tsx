import Link from "next/link";

import { CheckIcon, ChevronRightIcon } from "lucide-react";

import { HubPanel } from "@/app/components/participations/hub/hub-section";
import type { HubPendingItem } from "@/app/lib/participations/hub-status";
import { cn } from "@/app/lib/utils";

/**
 * The participant's to-do list for the festival. Done steps stay, ticked;
 * an item with somewhere to go links there.
 */
export default function HubPendingList({ items }: { items: HubPendingItem[] }) {
  if (items.length === 0) return null;

  return (
    <HubPanel className="px-4 py-1">
      <ul>
        {items.map((item) => {
          const row = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                  item.done
                    ? "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "border-brand-lavender",
                )}
              >
                {item.done ? <CheckIcon className="size-3.5" /> : null}
              </span>
              <span
                className={cn(
                  "flex-1 text-sm",
                  item.done
                    ? "text-brand-neutral"
                    : "font-medium text-brand-ink",
                )}
              >
                {item.label}
                <span className="sr-only">
                  {item.done ? " (hecho)" : " (pendiente)"}
                </span>
              </span>
              {item.meta ? (
                <span className="shrink-0 text-xs text-brand-neutral">
                  {item.meta}
                </span>
              ) : null}
              {item.href && !item.done ? (
                <ChevronRightIcon
                  className="size-4 shrink-0 text-brand-neutral"
                  aria-hidden="true"
                />
              ) : null}
            </>
          );

          return (
            <li
              key={item.key}
              className="border-b border-brand-border last:border-b-0"
            >
              {item.href && !item.done ? (
                <Link
                  href={item.href}
                  className="flex min-h-12 items-center gap-3 py-2 hover:text-brand-primary"
                >
                  {row}
                </Link>
              ) : (
                <div className="flex min-h-12 items-center gap-3 py-2">
                  {row}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </HubPanel>
  );
}
