import { Skeleton } from "@/components/ui/skeleton";

export function UserDropdownSkeleton() {
  return (
    <div className="flex items-center space-x-4">
      <Skeleton className="h-8 w-8 rounded-full" />
    </div>
  );
}
