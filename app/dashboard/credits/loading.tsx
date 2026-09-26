import { Skeleton } from "@/app/components/ui/skeleton";

/** Shaped like the section's tables: a toolbar, rows, and the pager. */
export default function CreditsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" aria-busy="true">
      <div className="flex shrink-0 gap-2">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-hidden rounded-md border p-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
      <Skeleton className="h-8 w-full shrink-0" />
    </div>
  );
}
