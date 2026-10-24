import Title from "@/app/components/atoms/heading";
import { Skeleton } from "@/app/components/ui/skeleton";

/**
 * Shown the moment the bell is tapped, while the server reads the inbox: a
 * navigation inside Glitter waits for the server unless a loading state sits
 * below the layout both pages share, and the root one does not.
 */
export default function Loading() {
  return (
    <div className="container max-w-2xl p-3 md:p-6">
      <div className="mb-4">
        <Title>Notificaciones</Title>
      </div>
      <div className="space-y-4" aria-busy="true">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <Skeleton className="h-4 w-20" />
        <div className="overflow-hidden rounded-lg border bg-background">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={`notification-row-${index}`}
              className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
