import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
  const rows = Array.from({ length: 4 });

  return (
    <div className="container p-3 md:p-6">
      <div className="mb-4 flex flex-col gap-1 md:gap-2">
        <Skeleton className="h-8 w-44 md:h-10" />
        <Skeleton className="h-4 w-full max-w-md md:h-5" />
      </div>
      <div className="space-y-6">
        <div className="space-y-4 rounded-md border bg-card p-4 shadow-md">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-px w-full" />
          {rows.map((_, index) => (
            <div
              key={`balance-row-${index}`}
              className="flex justify-between gap-4"
            >
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="space-y-4 rounded-md border bg-card p-4 shadow-md">
          <Skeleton className="h-5 w-32" />
          {rows.map((_, index) => (
            <div
              key={`entry-row-${index}`}
              className="flex justify-between gap-4"
            >
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
