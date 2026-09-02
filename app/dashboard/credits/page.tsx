import { Suspense } from "react";

import CreditTopUpReviewQueue from "@/app/components/credits/admin/credit-top-up-review-queue";
import { Skeleton } from "@/app/components/ui/skeleton";

function QueueSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`queue-card-${index}`}
          className="space-y-3 rounded-md border bg-card p-4 shadow-md"
        >
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function CreditsDashboardPage() {
  return (
    <div className="container space-y-8 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Créditos</h1>
        <p className="text-sm text-muted-foreground">
          Aprobar una carga confirma los créditos ya emitidos. Rechazarla los
          revierte, pero nunca deshace una acción que el participante ya
          completó con ellos.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pendientes de revisión</h2>
        <Suspense fallback={<QueueSkeleton />}>
          <CreditTopUpReviewQueue
            scope="pending"
            emptyLabel="No hay cargas de créditos esperando revisión"
          />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Revisadas recientemente</h2>
        <Suspense fallback={<QueueSkeleton />}>
          <CreditTopUpReviewQueue
            scope="reviewed"
            emptyLabel="Todavía no revisaste ninguna carga"
          />
        </Suspense>
      </section>
    </div>
  );
}
