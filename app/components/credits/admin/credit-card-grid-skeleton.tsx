import { Skeleton } from "@/app/components/ui/skeleton";

/** Placeholder for the card grids the review queue and debt report render. */
export default function CreditCardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`queue-card-${index}`}
          className="space-y-3 rounded-md border bg-card p-4 shadow-md"
        >
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
