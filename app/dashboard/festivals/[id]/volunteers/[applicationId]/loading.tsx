import { Skeleton } from "@/app/components/ui/skeleton";

/**
 * The application's shape while it loads: back link and header, "Contacto"
 * and "Lo que eligió" on the main column, "Decisión y asignación" beside
 * them from lg (below on phones). No data, so it can be prefetched.
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
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <Skeleton className="h-8 w-full max-w-sm md:h-9" />
        <Skeleton className="h-4 w-full max-w-xs" />
      </div>
      <div className="grid min-w-0 items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <Skeleton className="h-56 w-full rounded-lg" />
          <Skeleton className="h-80 w-full rounded-lg" />
        </div>
        <Skeleton className="h-[28rem] w-full rounded-lg" />
      </div>
    </div>
  );
}
