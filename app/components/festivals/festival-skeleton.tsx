import { Skeleton } from "@/app/components/ui/skeleton";

export default function FestivalSkeleton() {
  return (
    <div className="container p-4 md:pd-6 space-y-4">
      <Skeleton className="h-6 w-80" />
      <Skeleton className="h-[200px] w-[320px] mx-auto mt-6 md:w-[500px] md:h-[320px]" />
    </div>
  );
}
