import { Skeleton } from "@/app/components/ui/skeleton";
import TableFiltersSkeleton from "@/app/components/users/skeletons/filters";
import TableSkeleton from "@/app/components/users/skeletons/table";

export default function Loading() {
  console.log("calling loading state for users table");
  return (
    <>
      <Skeleton className="h-6 w-80 mb-4" />
      <TableFiltersSkeleton />
      <TableSkeleton />
    </>
  );
}
