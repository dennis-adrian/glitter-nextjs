import { notFound } from "next/navigation";

import CreditDebtsDataTable from "@/app/components/credits/admin/credit-debts-data-table";
import { fetchCreditDebtReport } from "@/app/lib/credits/queries";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function CreditDebtsPage() {
  const [actor, accounts] = await Promise.all([
    getCurrentUserProfile(),
    fetchCreditDebtReport(),
  ]);
  if (!accounts) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="shrink-0 text-sm text-muted-foreground">
        Cuentas en negativo tras rechazar un comprobante ya usado, o con el
        saldo en caché descuadrado del libro. Un saldo negativo bloquea todo uso
        de créditos hasta regularizarlo.
      </p>
      <CreditDebtsDataTable
        accounts={accounts}
        canResolve={canMutateAdminReservations(actor)}
      />
    </div>
  );
}
