import { Card, CardContent } from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";

/**
 * The shape of the full-table credits introduction (credits-introduction.tsx),
 * so the 560 px card does not arrive after a generic detail skeleton.
 */
export default function CreditsIntroductionSkeleton() {
  return (
    <div
      className="container max-w-[560px] p-4 md:p-6"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Cargando…</span>
      <div className="mb-4 flex flex-col gap-1 md:gap-2">
        <Skeleton className="h-9 w-full md:h-10" />
        <Skeleton className="h-9 w-2/3 md:h-10" />
        <Skeleton className="mt-1 h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-72 max-w-full" />
              <Skeleton className="h-9 w-32" />
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                {["w-full", "w-full", "w-full", "w-11/12", "w-3/5"].map(
                  (width, index) => (
                    <Skeleton key={index} className={`h-3.5 ${width}`} />
                  ),
                )}
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Skeleton className="h-10 w-full rounded-full sm:w-44" />
              <Skeleton className="h-10 w-full rounded-full sm:w-36" />
            </div>
            <Skeleton className="h-4 w-48" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
