import type { FullTableDowngradeMoneyBlocker } from "@/app/lib/reservations/full-table-downgrade";

const MONEY_BLOCKER_REASONS: Record<FullTableDowngradeMoneyBlocker, string> = {
  // A zero-value request in review blocks too, as the upgrade's reason says.
  proof_under_review:
    "No se puede reducir mientras haya un comprobante o una solicitud en revisión.",
  credits: "No se puede reducir: el cobro tiene créditos aplicados.",
  approved_payment: "No se puede reducir: el cobro tiene un pago aprobado.",
  legacy_payment: "No se puede reducir: el cobro tiene un pago registrado.",
};

/**
 * Why "Reducir a media mesa" is inert for this viewer and reservation, or null
 * when it can run.
 *
 * The money reason comes from `fullTableDowngradeMoneyBlockerInTx`, the check
 * the service itself runs under its locks, so a disabled button never hides a
 * downgrade the service would allow, and an enabled one only fails on a race.
 * The control stays on the page with its reason rather than vanishing: an
 * admin should see the action exists and what stands in its way.
 */
export function fullTableDowngradeDisabledReason(input: {
  isGlobalAdmin: boolean;
  moneyBlocker: FullTableDowngradeMoneyBlocker | null;
}): string | null {
  if (!input.isGlobalAdmin) {
    return "Solo un administrador general puede reducirla.";
  }
  if (input.moneyBlocker) return MONEY_BLOCKER_REASONS[input.moneyBlocker];
  return null;
}
