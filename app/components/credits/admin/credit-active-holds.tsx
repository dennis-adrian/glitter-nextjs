import { formatCreditCount } from "@/app/components/credits/credit-amount";
import ReleaseFeatureCreditsButton from "@/app/components/credits/release-feature-credits-button";
import {
  type CreditBalances,
  unbackedHoldAmount,
} from "@/app/lib/credits/balances";
import type { FeatureHold } from "@/app/lib/credits/queries";

/**
 * Releases a participant's activated features from an admin screen.
 *
 * An activation only the participant could undo is unreachable once they stop
 * coming back — and the one whose voucher was rejected has the least reason
 * to. Releasing posts no entry either way; it drops the earmark, which frees
 * only credit that is still there.
 */
export default function CreditActiveHolds({
  userId,
  holds,
  balances,
  canAdjust,
}: {
  userId: number;
  holds: FeatureHold[];
  balances: CreditBalances;
  canAdjust: boolean;
}) {
  const activeHolds = holds.filter((hold) => hold.status === "active");
  if (activeHolds.length === 0) return null;

  // Releasing a backed hold gives the credits back; releasing one whose
  // credits were reversed closes the earmark and returns nothing, so the
  // two cannot share copy.
  const unbackedHolds = unbackedHoldAmount(balances);

  return (
    <div
      className={
        unbackedHolds > 0
          ? "space-y-2 rounded-md bg-amber-50 p-3 text-amber-900"
          : "space-y-2 rounded-md bg-muted p-3"
      }
    >
      <p
        className={
          unbackedHolds > 0 ? "text-xs" : "text-xs text-muted-foreground"
        }
      >
        {unbackedHolds > 0
          ? `Tiene la mesa completa activada con créditos que después se revirtieron. Liberarla cierra la reserva, pero no devuelve ${formatCreditCount(unbackedHolds)} a su saldo: esos créditos ya no están.`
          : "Tiene la mesa completa activada. Liberarla devuelve los créditos reservados a su saldo disponible."}
      </p>
      <div className="flex flex-wrap gap-2">
        {activeHolds.map((hold) => (
          <ReleaseFeatureCreditsButton
            key={hold.featureActionId}
            userId={userId}
            festivalId={hold.festivalId}
            label={
              unbackedHolds > 0
                ? `Liberar la mesa completa de ${hold.festivalName}`
                : `Liberar ${formatCreditCount(hold.amount)} de ${hold.festivalName}`
            }
            disabledReason={
              canAdjust
                ? undefined
                : "Solo un administrador general puede liberarla"
            }
          />
        ))}
      </div>
      {!canAdjust && (
        <p className="text-xs text-muted-foreground">
          Solo un administrador general puede liberarla.
        </p>
      )}
    </div>
  );
}
