import Link from "next/link";

import { Skeleton } from "@/app/components/ui/skeleton";

/**
 * Shown the moment a notification is opened (from the inbox, the bell or a
 * tap on the device), while the server reads it.
 */
export default function Loading() {
  return (
    <div className="container max-w-2xl space-y-3 p-3 md:p-6">
      <Link
        href="/my_notifications"
        className="text-sm text-muted-foreground hover:underline"
      >
        Volver a las notificaciones
      </Link>
      <div
        className="space-y-4 rounded-lg border bg-background p-4 md:p-6"
        aria-busy="true"
      >
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>
    </div>
  );
}
