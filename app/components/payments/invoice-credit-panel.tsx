import { formatCredits } from "@/app/components/credits/credit-amount";
import ApplyInvoiceCreditsButton from "@/app/components/payments/apply-invoice-credits-button";
import { invoiceCreditPlan } from "@/app/lib/credits/balances";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchCurrentUserCreditBalances } from "@/app/lib/credits/queries";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

type InvoiceCreditPanelProps = {
  invoiceId: number;
  /** Whose credits these are; the panel is hidden from everyone else. */
  ownerUserId: number;
  outstandingAmount: number;
};

/**
 * Credit tender for a reservation invoice: what the owner can put towards it
 * out of credits they already hold.
 *
 * Deliberately does not sell credits. This screen already has a QR code on it
 * — somebody who is short does not need a second thing to buy before they can
 * pay, they need to pay. Credits are bought for the optional features, from
 * the screens those features live on.
 *
 * So the panel appears only when it has something to offer: a usable balance,
 * or a debt explaining why an existing balance cannot be used. Anyone with
 * neither sees nothing rather than an empty "you have Bs0" and a dead button.
 */
export default async function InvoiceCreditPanel({
  invoiceId,
  ownerUserId,
  outstandingAmount,
}: InvoiceCreditPanelProps) {
  const [creditsEnabled, actor, balances] = await Promise.all([
    isFeatureEnabled("credits"),
    getCurrentUserProfile(),
    fetchCurrentUserCreditBalances(),
  ]);
  if (!creditsEnabled || !actor || !balances) return null;
  // Credits are the invoice owner's to spend, and applyInvoiceCredits refuses
  // anyone else. An admin viewing this page would otherwise be shown their own
  // balance on someone else's invoice, above a button that always fails.
  if (actor.id !== ownerUserId) return null;

  const plan = invoiceCreditPlan(balances, outstandingAmount);
  // Nothing to apply and nothing owed: there is no credit story to tell on
  // this page, so it stays out of the way of the payment.
  if (plan.applicableAmount <= 0 && plan.debtAmount <= 0) return null;

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      {plan.debtAmount > 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Tenés {formatCredits(plan.debtAmount)} pendientes por un comprobante
          rechazado. Regularizá ese saldo para volver a usar créditos.
        </p>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Tenés {formatCredits(balances.spendableBalance)} en créditos para usar
          en este pago.
        </p>
      )}

      {plan.applicableAmount > 0 && (
        <ApplyInvoiceCreditsButton
          invoiceId={invoiceId}
          applicableAmount={plan.applicableAmount}
        />
      )}
    </div>
  );
}
