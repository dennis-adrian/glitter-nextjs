import { Skeleton } from "@/app/components/ui/skeleton";
import UsersTableSkeleton from "@/app/components/users/table-skeleton";

export default function Loading() {
  console.log("calling loading state for users table");
  return (
    <>
      <Skeleton className="h-6 w-80 mb-4" />
      <UsersTableSkeleton />
    </>
  );
}
