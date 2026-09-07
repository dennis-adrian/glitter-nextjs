import { CheckCircle2Icon } from "lucide-react";

import CreditDebtCard from "@/app/components/credits/admin/credit-debt-card";
import { fetchCreditDebtReport } from "@/app/lib/credits/queries";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function CreditDebtReport() {
  const [actor, accounts] = await Promise.all([
    getCurrentUserProfile(),
    fetchCreditDebtReport(),
  ]);
  if (!accounts) return null;

  const canResolve = canMutateAdminReservations(actor);

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <CheckCircle2Icon className="h-12 w-12" />
        <span className="text-sm">
          Ninguna cuenta tiene saldo pendiente ni descuadre
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => (
        <CreditDebtCard
          key={account.user.id}
          account={account}
          canResolve={canResolve}
        />
      ))}
    </div>
  );
}
