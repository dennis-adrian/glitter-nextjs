"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/app/lib/utils";

/**
 * A list that loads its next batch as the end scrolls into view, with a
 * skeleton card while it does. No "load more" button: the sentinel is the
 * only trigger. Each batch is asked for by the ids already shown, not an
 * offset, so rows leaving or joining the list meanwhile never make it skip
 * one. A batch shorter than `batchSize` is the end. Starts over when the
 * server sends a new first batch, ignoring batches asked for before that. A
 * batch that fails keeps what is shown and offers to try again.
 */
export default function InfiniteList<T extends { id: number }>({
  initialItems,
  batchSize,
  loadMore,
  renderItem,
  className,
  itemClassName,
  loadingLabel,
  skeletonClassName,
}: {
  initialItems: T[];
  /** Rows per batch; a shorter batch means there are no more. */
  batchSize: number;
  /** The next batch, leaving out `seenIds`. */
  loadMore: (seenIds: number[]) => Promise<T[]>;
  renderItem: (item: T) => ReactNode;
  className?: string;
  itemClassName?: string;
  loadingLabel: string;
  skeletonClassName?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [exhausted, setExhausted] = useState(initialItems.length < batchSize);
  const [failed, setFailed] = useState(false);
  const [isLoading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  /** Bumped on every reset; a batch from an older one is dropped. */
  const generation = useRef(0);

  // A new sort or a refreshed first batch starts the list over.
  const [seenInitial, setSeenInitial] = useState(initialItems);
  if (seenInitial !== initialItems) {
    setSeenInitial(initialItems);
    setItems(initialItems);
    setExhausted(initialItems.length < batchSize);
    setFailed(false);
  }
  useEffect(() => {
    generation.current += 1;
  }, [initialItems]);

  // Not capped by the count at page load, so rows that arrive while
  // scrolling are still reached; a short batch is the end.
  const hasMore = !exhausted;

  const load = useCallback(() => {
    const asked = generation.current;
    const seenIds = items.map((item) => item.id);
    setFailed(false);
    startLoading(async () => {
      let next: T[];
      try {
        next = await loadMore(seenIds);
      } catch {
        if (asked === generation.current) setFailed(true);
        return;
      }
      if (asked !== generation.current) return;
      const seen = new Set(seenIds);
      const fresh = next.filter((item) => !seen.has(item.id));
      // A short batch, or nothing new, is the end: the sentinel cannot ask
      // again forever.
      if (next.length < batchSize || fresh.length === 0) setExhausted(true);
      if (fresh.length === 0) return;
      setItems((current) => {
        const shown = new Set(current.map((item) => item.id));
        return [...current, ...fresh.filter((item) => !shown.has(item.id))];
      });
    });
  }, [batchSize, items, loadMore]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || isLoading) {
          return;
        }
        load();
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, failed, isLoading, load]);

  return (
    <>
      <ul className={cn("flex flex-col", className)}>
        {items.map((item) => (
          <li key={item.id} className={itemClassName}>
            {renderItem(item)}
          </li>
        ))}
      </ul>
      {hasMore && failed && (
        <div
          role="alert"
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3",
            skeletonClassName,
          )}
        >
          <span className="min-w-0 text-muted-foreground">
            No pudimos cargar más.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={load}
          >
            Reintentar
          </Button>
        </div>
      )}
      {hasMore && !failed && (
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
