import { Skeleton } from "@/app/components/ui/skeleton";
import { pageFrame } from "@/app/components/volunteers/admin/tasks/task-frame";

/** Loading shape of every screen of the admin by task. */
export function VolunteerTaskSkeleton() {
  return (
    <div role="status" aria-busy="true" className={pageFrame}>
      <span className="sr-only">Cargando…</span>
      <div data-installed-hidden="" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-13 w-full rounded-full lg:max-w-90" />
      <Skeleton className="h-11 w-full rounded-md" />
      <VolunteerTaskBodySkeleton />
    </div>
  );
}

/**
 * Loading shape of a task's content below the header, which stays on
 * screen: switching between Revisar and Asignar loads only this.
 */
export function VolunteerTaskBodySkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">Cargando…</span>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-lg border bg-card p-3 lg:max-w-95"
        >
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * Loading shape of the application open in Revisar: only the detail, so the
 * list beside it stays as it was.
 */
export function VolunteerReviewDetailSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-w-0 flex-col gap-4 px-3 pt-4 pb-6 lg:gap-5 lg:rounded-lg lg:border lg:bg-card lg:p-6"
    >
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:max-w-172">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
