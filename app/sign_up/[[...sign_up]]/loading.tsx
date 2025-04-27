import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex justify-center my-4 w-full">
      <Skeleton className="w-[400px] h-[500px]" />
    </div>
  );
}
