import Link from "next/link";

import { formatCredits } from "@/app/components/credits/credit-amount";
import ApplyInvoiceCreditsButton from "@/app/components/payments/apply-invoice-credits-button";
import BuyInvoiceCreditsButton from "@/app/components/payments/buy-invoice-credits-button";
import { invoiceCreditPlan } from "@/app/lib/credits/balances";
import {
  fetchCurrentUserCreditBalances,
  fetchOpenInvoiceCreditTopUp,
} from "@/app/lib/credits/queries";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

type InvoiceCreditPanelProps = {
  invoiceId: number;
  /** Whose credits these are; the panel is hidden from everyone else. */
  ownerUserId: number;
  outstandingAmount: number;
};

function applyDenialReason(plan: {
  applicableAmount: number;
  debtAmount: number;
}) {
  if (plan.debtAmount > 0) {
    return `Tenés ${formatCredits(plan.debtAmount)} pendientes por un comprobante rechazado. Regularizá ese saldo para volver a usar créditos.`;
  }
  if (plan.applicableAmount <= 0) {
    return "Todavía no tenés créditos confirmados para este pago. Los créditos en revisión no se pueden aplicar a una reserva.";
  }
  return undefined;
}

/**
 * Credit tender for a reservation invoice: what can be applied now, and the
 * exact shortfall to buy. Buying and applying stay separate operations — a
 * purchase never starts, reserves, or completes the payment.
 */
export default async function InvoiceCreditPanel({
  invoiceId,
  ownerUserId,
  outstandingAmount,
}: InvoiceCreditPanelProps) {
  const [actor, balances] = await Promise.all([
    getCurrentUserProfile(),
    fetchCurrentUserCreditBalances(),
  ]);
  if (!actor || !balances) return null;
  // Credits are the invoice owner's to spend, and applyInvoiceCredits refuses
  // anyone else. An admin viewing this page would otherwise be shown their own
  // balance on someone else's invoice, above a button that always fails.
  if (actor.id !== ownerUserId) return null;

  const plan = invoiceCreditPlan(balances, outstandingAmount);
  const openTopUp = await fetchOpenInvoiceCreditTopUp(invoiceId, actor.id);

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <p className="text-center text-sm text-muted-foreground">
        Tenés {formatCredits(balances.invoiceEligibleBalance)} en créditos
        confirmados. Los créditos en revisión no se pueden usar para esta
        factura.
      </p>

      <ApplyInvoiceCreditsButton
        invoiceId={invoiceId}
        applicableAmount={plan.applicableAmount}
        disabledReason={applyDenialReason(plan)}
      />

      {plan.shortfallAmount > 0 &&
        plan.debtAmount === 0 &&
        (openTopUp ? (
          <p className="text-center text-sm text-muted-foreground">
            {openTopUp.status === "under_review"
              ? "Ya tenés una compra de créditos en revisión para este pago."
              : "Tenés una compra de créditos abierta."}{" "}
            <Link
              href="/my_credits"
              className="text-primary underline underline-offset-2"
            >
              Ver mis créditos
            </Link>
          </p>
        ) : (
          <BuyInvoiceCreditsButton
            invoiceId={invoiceId}
            shortfallAmount={plan.shortfallAmount}
          />
        ))}
    </div>
  );
}
