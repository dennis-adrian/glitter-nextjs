import { Suspense } from "react";

import CreditCardGridSkeleton from "@/app/components/credits/admin/credit-card-grid-skeleton";
import CreditTopUpReviewQueue from "@/app/components/credits/admin/credit-top-up-review-queue";

export default function CreditReviewsPage() {
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Aprobar una carga confirma los créditos ya emitidos. Rechazarla los
        revierte, pero nunca deshace una acción que el participante ya completó
        con ellos.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pendientes de revisión</h2>
        <Suspense fallback={<CreditCardGridSkeleton />}>
          <CreditTopUpReviewQueue
            scope="pending"
            emptyLabel="No hay cargas de créditos esperando revisión"
          />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Revisadas recientemente</h2>
        <Suspense fallback={<CreditCardGridSkeleton />}>
          <CreditTopUpReviewQueue
            scope="reviewed"
            emptyLabel="Todavía no revisaste ninguna carga"
          />
        </Suspense>
      </section>
    </div>
  );
}
