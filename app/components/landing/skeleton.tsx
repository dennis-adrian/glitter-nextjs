import { Skeleton } from "@/app/components/ui/skeleton";

export default function LandingSkeleton() {
  return (
    <div className="container flex flex-col items-center p-4 md:p-6">
      <Skeleton className="w-full h-[400px] md:h-[300px]" />
      <Skeleton className="w-80 h-10 mt-6 mb-3" />
      <Skeleton className="w-64 h-6" />
      <Skeleton className="w-full h-72 md:hidden my-4" />
      <div className="md:justify-between my-4 hidden md:flex">
        <Skeleton className="w-64 h-64" />
        <Skeleton className="w-64 h-64" />
        <Skeleton className="w-64 h-64" />
        <Skeleton className="w-64 h-64" />
      </div>
    </div>
  );
}
