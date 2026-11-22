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
 * only trigger. Each batch is asked for by the ids already shown, not an
 * offset, so rows leaving or joining the list meanwhile never make it skip
 * one. Starts over when the server sends a new first batch, ignoring batches
 * asked for before that.
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
  /** The next batch, leaving out `seenIds`. */
  loadMore: (seenIds: number[]) => Promise<T[]>;
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
  /** Bumped on every reset; a batch from an older one is dropped. */
  const generation = useRef(0);

  // A new sort or a refreshed first batch starts the list over.
  const [seenInitial, setSeenInitial] = useState(initialItems);
  if (seenInitial !== initialItems) {
    setSeenInitial(initialItems);
    setItems(initialItems);
    setExhausted(false);
  }
  useEffect(() => {
    generation.current += 1;
  }, [initialItems]);

  const hasMore = !exhausted && items.length < total;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || isLoading) {
          return;
        }
        const asked = generation.current;
        const seenIds = items.map((item) => item.id);
        startLoading(async () => {
          const next = await loadMore(seenIds);
          if (asked !== generation.current) return;
          const seen = new Set(seenIds);
          const fresh = next.filter((item) => !seen.has(item.id));
          // Nothing new: the end, so the sentinel cannot ask again forever.
          if (fresh.length === 0) {
            setExhausted(true);
            return;
          }
          setItems((current) => {
            const shown = new Set(current.map((item) => item.id));
            return [...current, ...fresh.filter((item) => !shown.has(item.id))];
          });
        });
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, items, loadMore]);

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
