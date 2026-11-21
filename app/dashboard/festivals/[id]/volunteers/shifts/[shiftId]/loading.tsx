import { Skeleton } from "@/app/components/ui/skeleton";

/**
 * The shift's shape while it loads: back link and header, the coverage
 * card, then "Asignados" and "Pueden cubrirlo" (side by side from lg). No
 * data, so it can be prefetched.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="container flex min-w-0 flex-col gap-4 p-3 pb-10 md:p-6"
    >
      <span className="sr-only">Cargando…</span>
      <div data-installed-hidden="" className="flex flex-col gap-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-full max-w-sm md:h-9" />
        <Skeleton className="h-4 w-full max-w-xs" />
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="grid min-w-0 items-start gap-4 md:gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-[28rem] w-full rounded-lg" />
      </div>
    </div>
  );
}
