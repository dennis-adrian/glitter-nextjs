import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-4 md:p-6 max-w-screen-md mx-auto">
      <div className="flex flex-col gap-8">
        <Skeleton className="h-16 w-full" />
        <div className="flex flex-col gap-4 items-center">
          <Skeleton className="h-6 w-[300px]" />
          <Skeleton className="h-6 w-[200px]" />
        </div>
        <div className="flex flex-wrap gap-4 justify-center">
          <Skeleton className="w-80 h-44" />
          <Skeleton className="w-80 h-44" />
        </div>
      </div>
    </div>
  );
}
