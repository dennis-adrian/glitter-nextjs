import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/app/lib/utils";

export type ScreenSkeletonVariant =
  | "list"
  | "detail"
  | "table"
  | "grid"
  | "form"
  | "map";

/**
 * What a tap shows at once while the next screen's data arrives: the shape of
 * the screen, never its data. Used by the `loading.tsx` files, which Next
 * prefetches with the link, so the skeleton is on screen in the same frame as
 * the tap.
 *
 * It reads nothing about the request, so it can be prerendered and
 * prefetched. The installed app's top bar already shows the screen's title
 * (from `SCREENS`), so the heading's placeholder steps aside there, the same
 * way the page's own back links do.
 */
export default function ScreenSkeleton({
  variant = "list",
  className,
}: {
  variant?: ScreenSkeletonVariant;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      data-screen-skeleton={variant}
      className={cn(
        "container flex flex-col gap-5 p-4 md:p-6",
        variant === "form" ? "max-w-2xl" : "max-w-6xl",
        className,
      )}
    >
      <span className="sr-only">Cargando…</span>
      <div data-installed-hidden="" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48 md:h-9 md:w-64" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      <Body variant={variant} />
    </div>
  );
}

function Body({ variant }: { variant: ScreenSkeletonVariant }) {
  switch (variant) {
    case "detail":
      return (
        <>
          <Skeleton className="h-40 w-full rounded-2xl md:h-56" />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="mt-2 h-32 w-full rounded-2xl" />
            </div>
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </>
      );
    case "table":
      return (
        <>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-full max-w-sm" />
            <Skeleton className="ml-auto h-10 w-28 shrink-0" />
          </div>
          <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-brand-border">
            <Skeleton className="h-10 w-full rounded-none" />
            {Array.from({ length: 8 }, (_, row) => (
              <Skeleton
                key={row}
                className="h-12 w-full rounded-none opacity-70"
              />
            ))}
          </div>
        </>
      );
    case "grid":
      return (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, item) => (
            <div key={item} className="flex flex-col gap-2">
              <Skeleton className="aspect-square w-full rounded-2xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      );
    case "form":
      return (
        <div className="flex flex-col gap-5">
          {Array.from({ length: 5 }, (_, field) => (
            <div key={field} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-36" />
        </div>
      );
    case "map":
      return (
        <>
          <div className="flex gap-2">
            {Array.from({ length: 3 }, (_, tab) => (
              <Skeleton key={tab} className="h-9 w-24 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-[60vh] w-full rounded-2xl" />
        </>
      );
    case "list":
      return (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, row) => (
            <Skeleton key={row} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      );
  }
}
