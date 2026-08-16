import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="border-b bg-primary-50/70">
        <div className="container mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 sm:py-7 md:grid-cols-[minmax(0,1fr)_17rem] md:items-center lg:px-8">
          <div className="flex gap-4 sm:gap-5">
            <Skeleton className="aspect-4/5 w-24 shrink-0 rounded-xl sm:w-32" />
            <div className="flex-1 self-center space-y-3">
              <Skeleton className="h-10 w-full max-w-md" />
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-4 w-44 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-32 rounded-xl md:row-span-2" />
          <div className="flex gap-3 md:pl-37">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
      </div>

      <div
        id="mapa"
        className="container mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 sm:py-14 lg:px-8"
      >
        <div className="space-y-3">
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
        <Skeleton className="h-120 rounded-2xl" />
      </div>
    </div>
  );
}
