import { Skeleton } from "@/app/components/ui/skeleton";

export default function PostEditorSkeleton() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <div className="flex flex-col gap-4 pb-24">
        <div className="-mx-4 border-b bg-background/95 px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-md" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-36" />
            </div>
          </div>
        </div>

        <div className="-mx-4 md:mx-0">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <div className="mx-1 h-5 w-px bg-border" />
            <Skeleton className="h-8 w-24" />
            <div className="mx-1 h-5 w-px bg-border" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <div className="mx-1 h-5 w-px bg-border" />
            <Skeleton className="h-8 w-8" />
            <div className="mx-1 h-5 w-px bg-border" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl space-y-4 pt-2">
          <div className="flex justify-center">
            <Skeleton className="h-9 w-28" />
          </div>

          <div className="px-[54px]">
            <Skeleton className="h-12 w-3/4 md:h-14" />
          </div>

          <div className="space-y-3 bg-white px-[54px] pt-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-10/12" />
            <Skeleton className="h-4 w-9/12" />
          </div>
        </div>
      </div>
    </div>
  );
}
