import { Skeleton } from "@/app/components/ui/skeleton";

export default function TableFiltersSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      <Skeleton className="h-10 max-w-96 w-full" />
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-10 w-20" />
    </div>
  );
}
