import { Skeleton } from "@/components/ui/skeleton";

export function UserProfileSkeleton() {
  return (
    <div className="w-full max-w-screen-md m-auto flex flex-col items-center gap-4 mt-8">
      <Skeleton className="h-32 w-32 rounded-full" />
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-5 w-14 rounded-xl" />
      <div className="space-y-2 flex flex-col items-center justify-center">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}
