import { Suspense } from "react";

import CreditCardGridSkeleton from "@/app/components/credits/admin/credit-card-grid-skeleton";
import CreditDebtReport from "@/app/components/credits/admin/credit-debt-report";

export default function CreditDebtsPage() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Saldos pendientes</h2>
      <p className="text-sm text-muted-foreground">
        Cuentas que quedaron en negativo tras rechazar un comprobante ya usado,
        o cuyo saldo en caché no coincide con el libro. Un saldo negativo
        bloquea todo uso de créditos hasta regularizarlo.
      </p>
      <Suspense fallback={<CreditCardGridSkeleton />}>
        <CreditDebtReport />
      </Suspense>
    </section>
  );
}
