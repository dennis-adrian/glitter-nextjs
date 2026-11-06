import { FestivalGuideSkeleton } from "@/app/components/festivals/festival-guide";
import { Skeleton } from "@/app/components/ui/skeleton";

/**
 * The festival page's shape while it loads: the banner and its bar, the ticket
 * button, the guide, and the map where the page puts it, so a link to #mapa
 * lands where the map will be.
 */
export default function Loading() {
  return (
    <div>
      <div className="container mx-auto flex max-w-7xl flex-col gap-3 px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-card">
          <Skeleton className="aspect-3/1 w-full rounded-none" />
          <div className="space-y-2 p-4 sm:p-5">
            <Skeleton className="h-8 w-full max-w-md" />
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-4 w-40 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-full sm:max-w-md" />
      </div>

      <div className="container mx-auto flex max-w-7xl flex-col gap-12 px-4 pb-10 pt-6 sm:gap-16 sm:px-6 sm:pb-14 lg:px-8">
        <FestivalGuideSkeleton />
        <div id="mapa" className="scroll-mt-24 space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-10 w-72 max-w-full" />
            <Skeleton className="h-5 w-full max-w-xl" />
          </div>
          <Skeleton className="h-120 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
