import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div className="w-full md:w-3/5">
          <Skeleton className="h-6" />
          <Skeleton className="h-5 w-[230px] my-2" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <Skeleton className="h-60 w-[240px] mx-auto md:w-1/5" />
      </div>
      <div>
        <Skeleton className="h-6 w-60 mt-6" />
        <Skeleton className="h-5 w-14 my-4" />
      </div>
      <div>
        <Skeleton className="h-[200px] w-[320px] mx-auto mt-6 md:w-[500px] md:h-[320px]" />
      </div>
    </div>
  );
}
