"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/app/lib/utils";

/**
 * A list that loads its next batch as the end scrolls into view, with a
 * skeleton card while it does. No "load more" button: the sentinel is the
 * only trigger. Starts over when the server sends a new first batch.
 */
export default function InfiniteList<T extends { id: number }>({
  initialItems,
  total,
  loadMore,
  renderItem,
  className,
  itemClassName,
  loadingLabel,
  skeletonClassName,
}: {
  initialItems: T[];
  /** How many there are in all; loading stops once they are all shown. */
  total: number;
  /** The batch starting at `offset`. */
  loadMore: (offset: number) => Promise<T[]>;
  renderItem: (item: T) => ReactNode;
  className?: string;
  itemClassName?: string;
  loadingLabel: string;
  skeletonClassName?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [exhausted, setExhausted] = useState(false);
  const [isLoading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  // A new sort or a refreshed first batch starts the list over.
  const [seenInitial, setSeenInitial] = useState(initialItems);
  if (seenInitial !== initialItems) {
    setSeenInitial(initialItems);
    setItems(initialItems);
    setExhausted(false);
  }

  const hasMore = !exhausted && items.length < total;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || isLoading) {
          return;
        }
        startLoading(async () => {
          const next = await loadMore(items.length);
          if (next.length === 0) {
            setExhausted(true);
            return;
          }
          setItems((current) => {
            const seen = new Set(current.map((item) => item.id));
            return [...current, ...next.filter((item) => !seen.has(item.id))];
          });
        });
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, items.length, loadMore]);

  return (
    <>
      <ul className={cn("flex flex-col", className)}>
        {items.map((item) => (
          <li key={item.id} className={itemClassName}>
            {renderItem(item)}
          </li>
        ))}
      </ul>
      {hasMore && (
        <div
          ref={sentinel}
          role="status"
          aria-label={loadingLabel}
          className={cn(
            "flex flex-col gap-2 rounded-lg border bg-card p-3",
            skeletonClassName,
          )}
        >
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      )}
    </>
  );
}
